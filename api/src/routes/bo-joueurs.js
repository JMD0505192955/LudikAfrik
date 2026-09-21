/* ============================================================
   Back-office — Module 3 : Utilisateurs (joueurs).
   Monté : app.use('/bo', require('./routes/bo-joueurs'));

     GET   /bo/joueurs?q=&statut=&page=    liste + recherche
     GET   /bo/joueurs/:id                 fiche complète
     POST  /bo/joueurs/:id/moderation      suspendre/bannir/réactiver/réinitialiser
     GET   /bo/joueurs/:id/reclamations    tickets liés à ce joueur
     GET   /bo/reclamations?statut=&page=  file des réclamations
     PATCH /bo/reclamations/:id            changer statut / assigner

   Périmètre : un opérateur ne voit que les joueurs de son pays.
   ============================================================ */
'use strict';
const express = require('express');
const { q } = require('../lib/bd');
const { protege } = require('../lib/auth');
const { exige, auditer, filtrePerimetre } = require('../lib/bo-acces');

const r = express.Router();
r.use(express.json());
r.use(protege);

function masquer(tel) {
  if (!tel) return '—';
  return tel.slice(0, 6) + ' ** ** ' + tel.slice(-2);
}

// --- liste + recherche (scopée par pays pour les opérateurs) ---
r.get('/joueurs', exige('joueurs.lire'), async (req, res) => {
  try {
    const page = Math.max(0, parseInt(req.query.page, 10) || 0);
    const PAGE = 25;
    const clauses = [], params = []; let i = 1;

    // recherche pseudo/téléphone
    if (req.query.q) { clauses.push('(pseudo ILIKE $' + i + ' OR telephone ILIKE $' + i + ')'); params.push('%' + req.query.q.trim() + '%'); i++; }
    // filtre statut
    if (req.query.statut) { clauses.push('statut = $' + i); params.push(req.query.statut); i++; }
    // périmètre opérateur : restreindre au pays du compte
    const f = filtrePerimetre(req.acces, 'pays', null, i);
    if (f.where) { clauses.push(f.where); f.params.forEach(p => params.push(p)); i = f.prochainParam; }

    let sql = 'SELECT id, telephone, pays, operateur, pseudo, statut, cree_le, vu_le FROM abonnes';
    if (clauses.length) sql += ' WHERE ' + clauses.join(' AND ');
    sql += ' ORDER BY cree_le DESC LIMIT ' + PAGE + ' OFFSET ' + (page * PAGE);
    const { rows } = await q(sql, params);
    rows.forEach(a => { a.telephone_masque = masquer(a.telephone); delete a.telephone; });
    res.json({ ok: true, page, joueurs: rows });
  } catch (e) { console.error(e); res.status(500).json({ erreur: 'Erreur serveur.' }); }
});

// --- fiche joueur complète ---
r.get('/joueurs/:id', exige('joueurs.lire'), async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const a = await q('SELECT * FROM abonnes WHERE id=$1', [id]);
    if (!a.rows.length) return res.status(404).json({ erreur: 'Joueur introuvable.' });
    const joueur = a.rows[0];

    // périmètre : un opérateur ne voit que son pays
    if (req.acces && !req.acces.interne && req.acces.perimetre.paysIso
        && req.acces.perimetre.paysIso !== joueur.pays)
      return res.status(403).json({ erreur: 'Hors de ton périmètre.' });

    // pass actif
    const pass = await q(
      "SELECT pass, fin, reconduction FROM abonnements WHERE abonne_id=$1 AND statut='actif' AND fin > now() ORDER BY fin DESC LIMIT 1", [id]);
    // points cumulés
    const pts = await q('SELECT coalesce(sum(score),0)::int AS total, count(*)::int AS parties FROM scores WHERE abonne_id=$1', [id]);
    // historique de modération
    const mod = await q('SELECT action, motif, admin_nom, cree_le FROM bo_moderation WHERE abonne_id=$1 ORDER BY cree_le DESC LIMIT 20', [id]);
    // dernières parties
    const parties = await q('SELECT jeu, score, victoire, cree_le FROM scores WHERE abonne_id=$1 ORDER BY cree_le DESC LIMIT 10', [id]);

    res.json({ ok: true, joueur: {
      id: joueur.id, telephone_masque: masquer(joueur.telephone), pays: joueur.pays,
      operateur: joueur.operateur, pseudo: joueur.pseudo, statut: joueur.statut,
      cree_le: joueur.cree_le, vu_le: joueur.vu_le,
      pass: pass.rows[0] || null,
      points: pts.rows[0].total, parties_jouees: pts.rows[0].parties,
      moderation: mod.rows, dernieres_parties: parties.rows
    }});
  } catch (e) { console.error(e); res.status(500).json({ erreur: 'Erreur serveur.' }); }
});

// --- modération ---
r.post('/joueurs/:id/moderation', exige('joueurs.ecrire'), async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const { action, motif } = req.body || {};
    const map = { suspension: 'suspendu', bannissement: 'banni', reactivation: 'actif', reinitialisation: null };
    if (!(action in map)) return res.status(400).json({ erreur: 'Action inconnue.' });

    const a = await q('SELECT id, pays, pseudo FROM abonnes WHERE id=$1', [id]);
    if (!a.rows.length) return res.status(404).json({ erreur: 'Joueur introuvable.' });

    // périmètre
    if (req.acces && !req.acces.interne && req.acces.perimetre.paysIso
        && req.acces.perimetre.paysIso !== a.rows[0].pays)
      return res.status(403).json({ erreur: 'Hors de ton périmètre.' });

    if (action === 'reinitialisation') {
      // réinitialiser le pseudo (ex: pseudo inapproprié)
      await q('UPDATE abonnes SET pseudo=NULL WHERE id=$1', [id]);
    } else {
      await q('UPDATE abonnes SET statut=$1 WHERE id=$2', [map[action], id]);
    }
    const nom = (req.admin && req.admin.nom) || null;
    await q('INSERT INTO bo_moderation(abonne_id, admin_id, admin_nom, action, motif) VALUES ($1,$2,$3,$4,$5)',
      [id, req.admin && req.admin.id, nom, action, motif || null]);
    await auditer(req, 'joueur.' + action, 'joueur#' + id, { motif });
    res.json({ ok: true });
  } catch (e) { console.error(e); res.status(500).json({ erreur: 'Erreur serveur.' }); }
});

// --- réclamations d'un joueur ---
r.get('/joueurs/:id/reclamations', exige('joueurs.lire'), async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const { rows } = await q(
      'SELECT id, sujet, categorie, statut, cree_le FROM bo_reclamations WHERE abonne_id=$1 ORDER BY cree_le DESC', [id]);
    res.json({ ok: true, reclamations: rows });
  } catch (e) { console.error(e); res.status(500).json({ erreur: 'Erreur serveur.' }); }
});

// --- file des réclamations (scopée) ---
r.get('/reclamations', exige('support.lire'), async (req, res) => {
  try {
    const page = Math.max(0, parseInt(req.query.page, 10) || 0);
    const PAGE = 30;
    const clauses = [], params = []; let i = 1;
    if (req.query.statut) { clauses.push('statut=$' + i); params.push(req.query.statut); i++; }
    const f = filtrePerimetre(req.acces, 'pays_iso', 'operateur_id', i);
    if (f.where) { clauses.push(f.where); f.params.forEach(p => params.push(p)); i = f.prochainParam; }
    let sql = 'SELECT id, telephone, sujet, categorie, statut, pays_iso, cree_le FROM bo_reclamations';
    if (clauses.length) sql += ' WHERE ' + clauses.join(' AND ');
    sql += ' ORDER BY cree_le DESC LIMIT ' + PAGE + ' OFFSET ' + (page * PAGE);
    const { rows } = await q(sql, params);
    rows.forEach(x => { if (x.telephone) x.telephone = masquer(x.telephone); });
    res.json({ ok: true, page, reclamations: rows });
  } catch (e) { console.error(e); res.status(500).json({ erreur: 'Erreur serveur.' }); }
});

// --- traiter une réclamation ---
r.patch('/reclamations/:id', exige('support.ecrire'), async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const { statut, assigne_a } = req.body || {};
    const champs = [], params = []; let i = 1;
    if (statut !== undefined) { champs.push('statut=$' + i); params.push(statut); i++; }
    if (assigne_a !== undefined) { champs.push('assigne_a=$' + i); params.push(assigne_a || null); i++; }
    if (!champs.length) return res.status(400).json({ erreur: 'Rien à modifier.' });
    champs.push('maj_le=now()'); params.push(id);
    await q('UPDATE bo_reclamations SET ' + champs.join(', ') + ' WHERE id=$' + i, params);
    await auditer(req, 'reclamation.modifiee', 'reclamation#' + id, { statut });
    res.json({ ok: true });
  } catch (e) { console.error(e); res.status(500).json({ erreur: 'Erreur serveur.' }); }
});

module.exports = r;
