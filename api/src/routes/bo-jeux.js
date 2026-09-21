/* ============================================================
   Back-office — Module 4 : Jeux.
   Monté : app.use('/bo', require('./routes/bo-jeux'));

     GET   /bo/jeux                      catalogue complet
     POST  /bo/jeux                      ajouter un jeu
     PATCH /bo/jeux/:id                  modifier (actif, en_avant, ordre, params)
     GET   /bo/jeux/:id/pays             disponibilité par pays
     PUT   /bo/jeux/:id/pays/:iso        activer/désactiver dans un pays
     GET   /bo/jeux/:id/stats            statistiques du jeu
   ============================================================ */
'use strict';
const express = require('express');
const { q } = require('../lib/bd');
const { protege } = require('../lib/auth');
const { exige, auditer } = require('../lib/bo-acces');

const r = express.Router();
r.use(express.json());
r.use(protege);

// --- catalogue complet ---
r.get('/jeux', exige('jeux.lire'), async (_req, res) => {
  try {
    const { rows } = await q(
      `SELECT j.id, j.slug, j.nom, j.categorie, j.actif, j.en_avant, j.ordre, j.parametres,
              (SELECT count(*)::int FROM bo_jeux_pays jp WHERE jp.jeu_id=j.id AND jp.disponible=false) AS pays_masques
         FROM bo_jeux j ORDER BY j.ordre, j.nom`);
    res.json({ ok: true, jeux: rows });
  } catch (e) { console.error(e); res.status(500).json({ erreur: 'Erreur serveur.' }); }
});

// --- ajouter un jeu ---
r.post('/jeux', exige('jeux.ecrire'), async (req, res) => {
  try {
    const { slug, nom, categorie, description, fichier } = req.body || {};
    if (!slug || !nom) return res.status(400).json({ erreur: 'Slug et nom requis.' });
    const ins = await q(
      `INSERT INTO bo_jeux(slug, nom, categorie, description, fichier)
       VALUES ($1,$2,$3,$4,$5) RETURNING id`,
      [slug.trim(), nom.trim(), categorie || 'Arcade', description || null, fichier || null]);
    await auditer(req, 'jeu.cree', 'jeu#' + ins.rows[0].id, { slug, nom });
    res.json({ ok: true, id: ins.rows[0].id });
  } catch (e) {
    if (e.code === '23505') return res.status(409).json({ erreur: 'Ce slug existe déjà.' });
    console.error(e); res.status(500).json({ erreur: 'Erreur serveur.' });
  }
});

// --- modifier un jeu (activation, mise en avant, ordre, paramètres) ---
r.patch('/jeux/:id', exige('jeux.ecrire'), async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const permis = ['nom', 'categorie', 'description', 'actif', 'en_avant', 'ordre', 'parametres', 'fichier'];
    const champs = [], params = []; let i = 1;
    permis.forEach(k => {
      if (req.body[k] !== undefined) {
        champs.push(k + '=$' + i);
        params.push(k === 'parametres' ? JSON.stringify(req.body[k]) : req.body[k]); i++;
      }
    });
    if (!champs.length) return res.status(400).json({ erreur: 'Rien à modifier.' });
    champs.push('maj_le=now()'); params.push(id);
    await q('UPDATE bo_jeux SET ' + champs.join(', ') + ' WHERE id=$' + i, params);
    await auditer(req, 'jeu.modifie', 'jeu#' + id, req.body);
    res.json({ ok: true });
  } catch (e) { console.error(e); res.status(500).json({ erreur: 'Erreur serveur.' }); }
});

// --- disponibilité par pays ---
r.get('/jeux/:id/pays', exige('jeux.lire'), async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    // tous les pays + l'état de dispo du jeu (défaut : disponible)
    const { rows } = await q(
      `SELECT p.iso, p.nom, coalesce(jp.disponible, true) AS disponible
         FROM bo_pays p
         LEFT JOIN bo_jeux_pays jp ON jp.pays_iso=p.iso AND jp.jeu_id=$1
        WHERE p.actif=true ORDER BY p.nom`, [id]);
    res.json({ ok: true, pays: rows });
  } catch (e) { console.error(e); res.status(500).json({ erreur: 'Erreur serveur.' }); }
});

// --- activer/désactiver un jeu dans un pays ---
r.put('/jeux/:id/pays/:iso', exige('jeux.ecrire'), async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const iso = req.params.iso.toUpperCase();
    const disponible = !!(req.body && req.body.disponible);
    await q(
      `INSERT INTO bo_jeux_pays(jeu_id, pays_iso, disponible) VALUES ($1,$2,$3)
       ON CONFLICT (jeu_id, pays_iso) DO UPDATE SET disponible=EXCLUDED.disponible`,
      [id, iso, disponible]);
    await auditer(req, 'jeu.pays', 'jeu#' + id, { pays: iso, disponible });
    res.json({ ok: true });
  } catch (e) { console.error(e); res.status(500).json({ erreur: 'Erreur serveur.' }); }
});

// --- statistiques d'un jeu ---
r.get('/jeux/:id/stats', exige('jeux.lire'), async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const jeu = await q('SELECT slug, nom FROM bo_jeux WHERE id=$1', [id]);
    if (!jeu.rows.length) return res.status(404).json({ erreur: 'Jeu introuvable.' });
    const slug = jeu.rows[0].slug;
    // sessions, meilleur score, taux de victoire, popularité par pays (7 derniers jours)
    const [sessions, vic, pays] = await Promise.all([
      q("SELECT count(*)::int AS n, coalesce(max(score),0)::int AS meilleur, coalesce(avg(score),0)::int AS moyen FROM scores WHERE jeu=$1 AND cree_le > now() - interval '7 days'", [slug]),
      q("SELECT count(*) FILTER (WHERE victoire)::int AS gagnees, count(*)::int AS total FROM scores WHERE jeu=$1 AND cree_le > now() - interval '7 days'", [slug]),
      q(`SELECT a.pays, count(*)::int AS parties
           FROM scores s JOIN abonnes a ON a.id=s.abonne_id
          WHERE s.jeu=$1 AND s.cree_le > now() - interval '7 days'
          GROUP BY a.pays ORDER BY parties DESC`, [slug])
    ]);
    const total = vic.rows[0].total || 0;
    res.json({ ok: true, jeu: jeu.rows[0].nom,
      sessions_7j: sessions.rows[0].n,
      meilleur_score: sessions.rows[0].meilleur,
      score_moyen: sessions.rows[0].moyen,
      taux_victoire: total ? Math.round(vic.rows[0].gagnees / total * 100) : 0,
      popularite_pays: pays.rows });
  } catch (e) { console.error(e); res.status(500).json({ erreur: 'Erreur serveur.' }); }
});

module.exports = r;
