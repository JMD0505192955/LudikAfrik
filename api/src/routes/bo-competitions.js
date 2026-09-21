/* ============================================================
   Back-office — Module 8 : Compétitions.
   Monté : app.use('/bo', require('./routes/bo-competitions'));

     GET   /bo/competitions              liste (scopée)
     POST  /bo/competitions              créer (brouillon ou à valider si sponsor)
     PATCH /bo/competitions/:id          modifier
     POST  /bo/competitions/:id/valider  publier une compétition sponsorisée
     POST  /bo/competitions/:id/refuser  refuser une compétition sponsorisée
     GET   /bo/competitions/:id/classement  classement live + suspects
     POST  /bo/competitions/:id/participants/:pid/suspect  (dé)marquer suspect

   Règle clé : une compétition proposée par un OPÉRATEUR (sponsor) passe
   en 'en_attente_validation' et n'est publiée qu'après validation par
   l'équipe interne (permission competitions.valider).
   ============================================================ */
'use strict';
const express = require('express');
const { q } = require('../lib/bd');
const { protege } = require('../lib/auth');
const { exige, auditer, filtrePerimetre } = require('../lib/bo-acces');

const r = express.Router();
r.use(express.json());
r.use(protege);

// --- liste (scopée : un opérateur voit les siennes + les publiques de son pays) ---
r.get('/competitions', exige('competitions.lire'), async (req, res) => {
  try {
    const clauses = [], params = []; let i = 1;
    if (req.query.statut) { clauses.push('statut=$' + i); params.push(req.query.statut); i++; }
    // périmètre : un opérateur ne voit que ses compétitions sponsorisées
    if (req.acces && !req.acces.interne && req.acces.perimetre.operateurId) {
      clauses.push('sponsor_operateur_id=$' + i); params.push(req.acces.perimetre.operateurId); i++;
    }
    let sql = `SELECT id, titre, type, jeux, pays_eligibles, debut, fin, periodicite,
                      sponsor_operateur_id, statut, cree_le FROM bo_competitions`;
    if (clauses.length) sql += ' WHERE ' + clauses.join(' AND ');
    sql += ' ORDER BY debut DESC LIMIT 100';
    const { rows } = await q(sql, params);
    res.json({ ok: true, competitions: rows });
  } catch (e) { console.error(e); res.status(500).json({ erreur: 'Erreur serveur.' }); }
});

// --- créer ---
r.post('/competitions', exige('competitions.ecrire'), async (req, res) => {
  try {
    const { titre, type, jeux, pays_eligibles, debut, fin, periodicite, bareme, recompenses } = req.body || {};
    if (!titre || !debut || !fin) return res.status(400).json({ erreur: 'Titre et période requis.' });

    // si le créateur est un opérateur, la compétition est sponsorisée et attend validation
    let statut = 'brouillon';
    let sponsor = null;
    if (req.acces && !req.acces.interne && req.acces.perimetre.operateurId) {
      sponsor = req.acces.perimetre.operateurId;
      statut = 'en_attente_validation';   // soumise à ta validation avant publication
    }
    const ins = await q(
      `INSERT INTO bo_competitions(titre, type, jeux, pays_eligibles, debut, fin, periodicite,
        bareme, recompenses, sponsor_operateur_id, cree_par, statut)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING id`,
      [titre, type || 'classement', jeux || null, pays_eligibles || null, debut, fin,
       periodicite || 'ponctuelle',
       bareme ? JSON.stringify(bareme) : null,
       recompenses ? JSON.stringify(recompenses) : null,
       sponsor, req.admin && req.admin.id, statut]);
    await auditer(req, 'competition.creee', 'competition#' + ins.rows[0].id, { titre, statut });
    res.json({ ok: true, id: ins.rows[0].id, statut });
  } catch (e) { console.error(e); res.status(500).json({ erreur: 'Erreur serveur.' }); }
});

// --- modifier ---
r.patch('/competitions/:id', exige('competitions.ecrire'), async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const permis = ['titre', 'type', 'jeux', 'pays_eligibles', 'debut', 'fin', 'periodicite', 'bareme', 'recompenses', 'statut'];
    const champs = [], params = []; let i = 1;
    permis.forEach(k => {
      if (req.body[k] !== undefined) {
        champs.push(k + '=$' + i);
        params.push((k === 'bareme' || k === 'recompenses') ? JSON.stringify(req.body[k]) : req.body[k]); i++;
      }
    });
    if (!champs.length) return res.status(400).json({ erreur: 'Rien à modifier.' });
    champs.push('maj_le=now()'); params.push(id);
    await q('UPDATE bo_competitions SET ' + champs.join(', ') + ' WHERE id=$' + i, params);
    await auditer(req, 'competition.modifiee', 'competition#' + id, req.body);
    res.json({ ok: true });
  } catch (e) { console.error(e); res.status(500).json({ erreur: 'Erreur serveur.' }); }
});

// --- valider une compétition sponsorisée (équipe interne uniquement) ---
r.post('/competitions/:id/valider', exige('competitions.valider'), async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const c = await q('SELECT statut FROM bo_competitions WHERE id=$1', [id]);
    if (!c.rows.length) return res.status(404).json({ erreur: 'Compétition introuvable.' });
    if (c.rows[0].statut !== 'en_attente_validation')
      return res.status(400).json({ erreur: 'Cette compétition n\'attend pas de validation.' });
    await q("UPDATE bo_competitions SET statut='publiee', maj_le=now() WHERE id=$1", [id]);
    await auditer(req, 'competition.validee', 'competition#' + id);
    res.json({ ok: true });
  } catch (e) { console.error(e); res.status(500).json({ erreur: 'Erreur serveur.' }); }
});

// --- refuser une compétition sponsorisée ---
r.post('/competitions/:id/refuser', exige('competitions.valider'), async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    await q("UPDATE bo_competitions SET statut='refusee', maj_le=now() WHERE id=$1", [id]);
    await auditer(req, 'competition.refusee', 'competition#' + id, { motif: req.body && req.body.motif });
    res.json({ ok: true });
  } catch (e) { console.error(e); res.status(500).json({ erreur: 'Erreur serveur.' }); }
});

// --- classement live + participants suspects ---
r.get('/competitions/:id/classement', exige('competitions.lire'), async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const { rows } = await q(
      `SELECT cp.id, cp.meilleur_score, cp.parties, cp.suspect, cp.motif_suspect, a.pseudo
         FROM bo_competition_participants cp
         JOIN abonnes a ON a.id=cp.abonne_id
        WHERE cp.competition_id=$1
        ORDER BY cp.meilleur_score DESC LIMIT 100`, [id]);
    res.json({ ok: true, classement: rows });
  } catch (e) { console.error(e); res.status(500).json({ erreur: 'Erreur serveur.' }); }
});

// --- (dé)marquer un participant comme suspect ---
r.post('/competitions/:id/participants/:pid/suspect', exige('competitions.ecrire'), async (req, res) => {
  try {
    const pid = parseInt(req.params.pid, 10);
    const { suspect, motif } = req.body || {};
    await q('UPDATE bo_competition_participants SET suspect=$1, motif_suspect=$2 WHERE id=$3',
      [!!suspect, motif || null, pid]);
    await auditer(req, 'participant.suspect', 'participant#' + pid, { suspect, motif });
    res.json({ ok: true });
  } catch (e) { console.error(e); res.status(500).json({ erreur: 'Erreur serveur.' }); }
});

module.exports = r;
