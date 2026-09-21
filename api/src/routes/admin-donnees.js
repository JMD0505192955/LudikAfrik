/* ============================================================
   Données du back office. Toutes protégées par un jeton admin.
   Monté : app.use('/admin', require('./routes/admin-donnees'));

     GET /admin/tableau                → chiffres clés
     GET /admin/abonnes?q=&page=       → liste paginée
     GET /admin/prelevements?page=     → liste paginée
     GET /admin/classement             → top de la semaine
     GET /admin/journal?page=          → audit
   ============================================================ */
'use strict';
const express = require('express');
const { q } = require('../lib/bd');
const { protege } = require('../lib/auth');

const r = express.Router();
r.use(protege);           // tout ce fichier exige un admin connecté

const PAGE = 25;

/* Tableau de bord : chiffres clés. */
r.get('/tableau', async (_req, res) => {
  try {
    const [ab, actifs, sem, rev, parties] = await Promise.all([
      q('SELECT count(*)::int n FROM abonnes'),
      q("SELECT count(*)::int n FROM abonnements WHERE statut='actif' AND fin > now()"),
      q("SELECT count(DISTINCT abonne_id)::int n FROM scores WHERE cree_le > now() - interval '7 days'"),
      q("SELECT coalesce(sum(montant),0)::int s FROM prelevements WHERE statut='reussi' AND cree_le > now() - interval '30 days'"),
      q("SELECT count(*)::int n FROM scores WHERE cree_le > now() - interval '7 days'"),
    ]);
    res.json({ ok: true,
      abonnes: ab.rows[0].n,
      abonnementsActifs: actifs.rows[0].n,
      joueursSemaine: sem.rows[0].n,
      revenus30j: rev.rows[0].s,
      partiesSemaine: parties.rows[0].n,
    });
  } catch (e) { console.error('tableau', e); res.status(500).json({ erreur: 'Erreur serveur.' }); }
});

/* Liste des abonnés, recherche par pseudo ou téléphone. */
r.get('/abonnes', async (req, res) => {
  try {
    const page = Math.max(0, parseInt(req.query.page, 10) || 0);
    const rech = (req.query.q || '').trim();
    const params = [];
    let filtre = '';
    if (rech) { params.push('%' + rech + '%'); filtre = 'WHERE pseudo ILIKE $1 OR telephone ILIKE $1'; }
    params.push(PAGE, page * PAGE);
    const { rows } = await q(
      `SELECT id, telephone, pays, pseudo, statut, cree_le, vu_le
         FROM abonnes ${filtre}
        ORDER BY cree_le DESC
        LIMIT $${params.length - 1} OFFSET $${params.length}`, params);
    // masquer le numéro pour l'affichage
    rows.forEach(a => { a.telephone = a.telephone.slice(0, 6) + ' ** ** ' + a.telephone.slice(-2); });
    res.json({ ok: true, page, abonnes: rows });
  } catch (e) { console.error('abonnes', e); res.status(500).json({ erreur: 'Erreur serveur.' }); }
});

/* Prélèvements (traçabilité facturation). */
r.get('/prelevements', async (req, res) => {
  try {
    const page = Math.max(0, parseInt(req.query.page, 10) || 0);
    const { rows } = await q(
      `SELECT id, montant, devise, operateur, reference, statut, cree_le
         FROM prelevements ORDER BY cree_le DESC LIMIT $1 OFFSET $2`, [PAGE, page * PAGE]);
    res.json({ ok: true, page, prelevements: rows });
  } catch (e) { console.error('prelevements', e); res.status(500).json({ erreur: 'Erreur serveur.' }); }
});

/* Classement de la semaine (vue admin). */
r.get('/classement', async (_req, res) => {
  try {
    const { rows } = await q(
      `SELECT a.pseudo, MAX(s.score) meilleur, count(*)::int parties
         FROM scores s JOIN abonnes a ON a.id=s.abonne_id
        WHERE s.cree_le > now() - interval '7 days' AND a.pseudo IS NOT NULL
        GROUP BY a.pseudo ORDER BY meilleur DESC LIMIT 50`);
    res.json({ ok: true, rangs: rows });
  } catch (e) { console.error('classement admin', e); res.status(500).json({ erreur: 'Erreur serveur.' }); }
});

/* Journal d'audit. */
r.get('/journal', async (req, res) => {
  try {
    const page = Math.max(0, parseInt(req.query.page, 10) || 0);
    const { rows } = await q(
      `SELECT action, cible, ip, cree_le FROM journal ORDER BY cree_le DESC LIMIT $1 OFFSET $2`,
      [PAGE, page * PAGE]);
    res.json({ ok: true, page, journal: rows });
  } catch (e) { console.error('journal', e); res.status(500).json({ erreur: 'Erreur serveur.' }); }
});

module.exports = r;
