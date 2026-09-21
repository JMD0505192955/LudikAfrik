/* ============================================================
   Back-office — Module 5 : Points, règles & progression.
   Monté : app.use('/bo', require('./routes/bo-regles'));

     GET   /bo/bareme            barème de points
     PATCH /bo/bareme/:id        modifier un barème
     GET   /bo/conversions       règles de conversion
     POST  /bo/conversions       créer une conversion
     PATCH /bo/conversions/:id   modifier / (dés)activer
     GET   /bo/classements       classements paramétrés
     PATCH /bo/classements/:id   modifier (période, taille, lots)
   ============================================================ */
'use strict';
const express = require('express');
const { q } = require('../lib/bd');
const { protege } = require('../lib/auth');
const { exige, auditer } = require('../lib/bo-acces');

const r = express.Router();
r.use(express.json());
r.use(protege);

// --- barème ---
r.get('/bareme', exige('regles.lire'), async (_req, res) => {
  try {
    const { rows } = await q('SELECT id, action, libelle, points, actif FROM bo_bareme ORDER BY id');
    res.json({ ok: true, bareme: rows });
  } catch (e) { console.error(e); res.status(500).json({ erreur: 'Erreur serveur.' }); }
});

r.patch('/bareme/:id', exige('regles.ecrire'), async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const champs = [], params = []; let i = 1;
    if (req.body.points !== undefined) { champs.push('points=$' + i); params.push(parseInt(req.body.points, 10) || 0); i++; }
    if (req.body.actif !== undefined) { champs.push('actif=$' + i); params.push(!!req.body.actif); i++; }
    if (!champs.length) return res.status(400).json({ erreur: 'Rien à modifier.' });
    champs.push('maj_le=now()'); params.push(id);
    await q('UPDATE bo_bareme SET ' + champs.join(', ') + ' WHERE id=$' + i, params);
    await auditer(req, 'bareme.modifie', 'bareme#' + id, req.body);
    res.json({ ok: true });
  } catch (e) { console.error(e); res.status(500).json({ erreur: 'Erreur serveur.' }); }
});

// --- conversions ---
r.get('/conversions', exige('regles.lire'), async (_req, res) => {
  try {
    const { rows } = await q('SELECT id, libelle, cout_points, recompense_type, recompense_valeur, actif FROM bo_conversions ORDER BY cout_points');
    res.json({ ok: true, conversions: rows });
  } catch (e) { console.error(e); res.status(500).json({ erreur: 'Erreur serveur.' }); }
});

r.post('/conversions', exige('regles.ecrire'), async (req, res) => {
  try {
    const { libelle, cout_points, recompense_type, recompense_valeur } = req.body || {};
    if (!libelle || !cout_points || !recompense_type || !recompense_valeur)
      return res.status(400).json({ erreur: 'Tous les champs sont requis.' });
    const ins = await q(
      'INSERT INTO bo_conversions(libelle, cout_points, recompense_type, recompense_valeur) VALUES ($1,$2,$3,$4) RETURNING id',
      [libelle, parseInt(cout_points, 10), recompense_type, recompense_valeur]);
    await auditer(req, 'conversion.creee', 'conversion#' + ins.rows[0].id, req.body);
    res.json({ ok: true, id: ins.rows[0].id });
  } catch (e) { console.error(e); res.status(500).json({ erreur: 'Erreur serveur.' }); }
});

r.patch('/conversions/:id', exige('regles.ecrire'), async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const permis = ['libelle', 'cout_points', 'recompense_type', 'recompense_valeur', 'actif'];
    const champs = [], params = []; let i = 1;
    permis.forEach(k => { if (req.body[k] !== undefined) { champs.push(k + '=$' + i); params.push(req.body[k]); i++; } });
    if (!champs.length) return res.status(400).json({ erreur: 'Rien à modifier.' });
    params.push(id);
    await q('UPDATE bo_conversions SET ' + champs.join(', ') + ' WHERE id=$' + i, params);
    await auditer(req, 'conversion.modifiee', 'conversion#' + id, req.body);
    res.json({ ok: true });
  } catch (e) { console.error(e); res.status(500).json({ erreur: 'Erreur serveur.' }); }
});

// --- classements ---
r.get('/classements', exige('regles.lire'), async (_req, res) => {
  try {
    const { rows } = await q('SELECT id, code, libelle, periode, taille, actif, lots FROM bo_classements ORDER BY id');
    res.json({ ok: true, classements: rows });
  } catch (e) { console.error(e); res.status(500).json({ erreur: 'Erreur serveur.' }); }
});

r.patch('/classements/:id', exige('regles.ecrire'), async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const permis = ['libelle', 'periode', 'taille', 'actif', 'lots'];
    const champs = [], params = []; let i = 1;
    permis.forEach(k => {
      if (req.body[k] !== undefined) {
        champs.push(k + '=$' + i);
        params.push(k === 'lots' ? JSON.stringify(req.body[k]) : req.body[k]); i++;
      }
    });
    if (!champs.length) return res.status(400).json({ erreur: 'Rien à modifier.' });
    params.push(id);
    await q('UPDATE bo_classements SET ' + champs.join(', ') + ' WHERE id=$' + i, params);
    await auditer(req, 'classement.modifie', 'classement#' + id, req.body);
    res.json({ ok: true });
  } catch (e) { console.error(e); res.status(500).json({ erreur: 'Erreur serveur.' }); }
});

module.exports = r;
