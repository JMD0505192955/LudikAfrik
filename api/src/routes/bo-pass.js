/* ============================================================
   Back-office — Module 6 : Pass & monétisation.
   Monté : app.use('/bo', require('./routes/bo-pass'));

     GET   /bo/pass-types?pays=       types de pass (par pays)
     POST  /bo/pass-types             créer un type de pass
     PATCH /bo/pass-types/:id         modifier / (dés)activer
     GET   /bo/ventes?page=           historique des ventes (scopé)
     GET   /bo/promos                 codes promo
     POST  /bo/promos                 créer un code promo
     PATCH /bo/promos/:id             modifier / (dés)activer
   ============================================================ */
'use strict';
const express = require('express');
const { q } = require('../lib/bd');
const { protege } = require('../lib/auth');
const { exige, auditer, filtrePerimetre } = require('../lib/bo-acces');

const r = express.Router();
r.use(express.json());
r.use(protege);

function masquer(t){ return t ? t.slice(0,6)+' ** ** '+t.slice(-2) : '—'; }

// --- types de pass (filtrés par pays si demandé, et par périmètre) ---
r.get('/pass-types', exige('pass.lire'), async (req, res) => {
  try {
    const clauses = [], params = []; let i = 1;
    if (req.query.pays) { clauses.push('pays_iso=$' + i); params.push(req.query.pays.toUpperCase()); i++; }
    const f = filtrePerimetre(req.acces, 'pays_iso', null, i);
    if (f.where) { clauses.push(f.where); f.params.forEach(p => params.push(p)); i = f.prochainParam; }
    let sql = 'SELECT id, pays_iso, code, libelle, duree_jours, prix, devise, jeux_inclus, actif FROM bo_pass_types';
    if (clauses.length) sql += ' WHERE ' + clauses.join(' AND ');
    sql += ' ORDER BY pays_iso, duree_jours';
    const { rows } = await q(sql, params);
    res.json({ ok: true, types: rows });
  } catch (e) { console.error(e); res.status(500).json({ erreur: 'Erreur serveur.' }); }
});

r.post('/pass-types', exige('pass.ecrire'), async (req, res) => {
  try {
    const { pays_iso, code, libelle, duree_jours, prix, devise, jeux_inclus } = req.body || {};
    if (!pays_iso || !code || !libelle || !duree_jours || prix === undefined)
      return res.status(400).json({ erreur: 'Pays, code, libellé, durée et prix requis.' });
    const ins = await q(
      `INSERT INTO bo_pass_types(pays_iso, code, libelle, duree_jours, prix, devise, jeux_inclus)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id`,
      [pays_iso.toUpperCase(), code, libelle, parseInt(duree_jours,10), parseInt(prix,10), devise||'XOF', jeux_inclus||'tous']);
    await auditer(req, 'pass_type.cree', 'pass#' + ins.rows[0].id, { pays_iso, code, prix });
    res.json({ ok: true, id: ins.rows[0].id });
  } catch (e) {
    if (e.code === '23505') return res.status(409).json({ erreur: 'Ce pass existe déjà pour ce pays.' });
    console.error(e); res.status(500).json({ erreur: 'Erreur serveur.' });
  }
});

r.patch('/pass-types/:id', exige('pass.ecrire'), async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const permis = ['libelle','duree_jours','prix','devise','jeux_inclus','actif'];
    const champs = [], params = []; let i = 1;
    permis.forEach(k => { if (req.body[k] !== undefined) { champs.push(k+'=$'+i); params.push(req.body[k]); i++; } });
    if (!champs.length) return res.status(400).json({ erreur: 'Rien à modifier.' });
    params.push(id);
    await q('UPDATE bo_pass_types SET ' + champs.join(', ') + ' WHERE id=$' + i, params);
    await auditer(req, 'pass_type.modifie', 'pass#' + id, req.body);
    res.json({ ok: true });
  } catch (e) { console.error(e); res.status(500).json({ erreur: 'Erreur serveur.' }); }
});

// --- historique des ventes (scopé par pays/opérateur) ---
r.get('/ventes', exige('pass.lire'), async (req, res) => {
  try {
    const page = Math.max(0, parseInt(req.query.page, 10) || 0);
    const PAGE = 30;
    const clauses = [], params = []; let i = 1;
    const f = filtrePerimetre(req.acces, 'ab.pays_iso', 'ab.operateur_id', i);
    if (f.where) { clauses.push(f.where); f.params.forEach(p => params.push(p)); i = f.prochainParam; }
    let sql =
      `SELECT ab.id, ab.pass, ab.prix, ab.devise, ab.debut, ab.fin, ab.statut,
              ab.pays_iso, ab.promo_code, a.pseudo, a.telephone
         FROM abonnements ab
         LEFT JOIN abonnes a ON a.id=ab.abonne_id`;
    if (clauses.length) sql += ' WHERE ' + clauses.join(' AND ');
    sql += ' ORDER BY ab.debut DESC LIMIT ' + PAGE + ' OFFSET ' + (page*PAGE);
    const { rows } = await q(sql, params);
    rows.forEach(v => { v.telephone = masquer(v.telephone); });
    // total sur la période visible
    res.json({ ok: true, page, ventes: rows });
  } catch (e) { console.error(e); res.status(500).json({ erreur: 'Erreur serveur.' }); }
});

// --- promotions ---
r.get('/promos', exige('pass.lire'), async (_req, res) => {
  try {
    const { rows } = await q(
      'SELECT id, code, libelle, type, valeur, pays_iso, debut, fin, max_usages, usages, actif FROM bo_promos ORDER BY cree_le DESC');
    res.json({ ok: true, promos: rows });
  } catch (e) { console.error(e); res.status(500).json({ erreur: 'Erreur serveur.' }); }
});

r.post('/promos', exige('pass.ecrire'), async (req, res) => {
  try {
    const { code, libelle, type, valeur, pays_iso, debut, fin, max_usages } = req.body || {};
    if (!code || !libelle || valeur === undefined)
      return res.status(400).json({ erreur: 'Code, libellé et valeur requis.' });
    const ins = await q(
      `INSERT INTO bo_promos(code, libelle, type, valeur, pays_iso, debut, fin, max_usages)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id`,
      [code.toUpperCase().trim(), libelle, type||'reduction', parseInt(valeur,10),
       pays_iso||null, debut||null, fin||null, max_usages||null]);
    await auditer(req, 'promo.creee', 'promo#' + ins.rows[0].id, { code, type, valeur });
    res.json({ ok: true, id: ins.rows[0].id });
  } catch (e) {
    if (e.code === '23505') return res.status(409).json({ erreur: 'Ce code promo existe déjà.' });
    console.error(e); res.status(500).json({ erreur: 'Erreur serveur.' });
  }
});

r.patch('/promos/:id', exige('pass.ecrire'), async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const permis = ['libelle','valeur','fin','max_usages','actif'];
    const champs = [], params = []; let i = 1;
    permis.forEach(k => { if (req.body[k] !== undefined) { champs.push(k+'=$'+i); params.push(req.body[k]); i++; } });
    if (!champs.length) return res.status(400).json({ erreur: 'Rien à modifier.' });
    params.push(id);
    await q('UPDATE bo_promos SET ' + champs.join(', ') + ' WHERE id=$' + i, params);
    await auditer(req, 'promo.modifiee', 'promo#' + id, req.body);
    res.json({ ok: true });
  } catch (e) { console.error(e); res.status(500).json({ erreur: 'Erreur serveur.' }); }
});

module.exports = r;
