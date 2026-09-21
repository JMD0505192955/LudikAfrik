/* ============================================================
   Back-office — Module 2 : Pays & opérateurs.
   Monté : app.use('/bo', require('./routes/bo-pays'));

     GET   /bo/pays                     liste des pays (+ nb opérateurs)
     POST  /bo/pays                     créer un pays
     PATCH /bo/pays/:id                 modifier / activer un pays
     GET   /bo/pays/:iso/operateurs     opérateurs d'un pays
     POST  /bo/operateurs               créer un opérateur
     PATCH /bo/operateurs/:id           modifier / activer un opérateur
     GET   /bo/operateurs/:id/moyens    moyens de paiement d'un opérateur
     POST  /bo/operateurs/:id/moyens    ajouter un moyen de paiement

   Un opérateur partenaire ne voit que SON pays / SON opérateur
   (filtrePerimetre). L'équipe interne voit tout.
   ============================================================ */
'use strict';
const express = require('express');
const { q } = require('../lib/bd');
const { protege } = require('../lib/auth');
const { exige, auditer, filtrePerimetre } = require('../lib/bo-acces');

const r = express.Router();
r.use(express.json());
r.use(protege);

// masque les identifiants API (jamais renvoyés en clair)
function masquerApi(cfg) {
  if (!cfg) return null;
  const c = Object.assign({}, cfg);
  if (c.cle) c.cle = '••••' + String(c.cle).slice(-4);
  if (c.secret) c.secret = '••••';
  return c;
}

// --- liste des pays (scopée) ---
r.get('/pays', exige('pays.lire'), async (req, res) => {
  try {
    const f = filtrePerimetre(req.acces, 'p.iso', null, 1);
    let sql =
      `SELECT p.id, p.iso, p.nom, p.indicatif, p.devise, p.langue, p.longueur_num,
              p.actif, count(o.id)::int AS nb_operateurs
         FROM bo_pays p
         LEFT JOIN bo_operateurs o ON o.pays_id=p.id`;
    if (f.where) sql += ' WHERE ' + f.where;
    sql += ' GROUP BY p.id ORDER BY p.actif DESC, p.nom';
    const { rows } = await q(sql, f.params);
    res.json({ ok: true, pays: rows });
  } catch (e) { console.error(e); res.status(500).json({ erreur: 'Erreur serveur.' }); }
});

// --- créer un pays ---
r.post('/pays', exige('pays.ecrire'), async (req, res) => {
  try {
    const { iso, nom, indicatif, devise, langue, longueur_num } = req.body || {};
    if (!iso || !nom || !indicatif) return res.status(400).json({ erreur: 'ISO, nom et indicatif requis.' });
    const existe = await q('SELECT 1 FROM bo_pays WHERE iso=$1', [iso.toUpperCase()]);
    if (existe.rows.length) return res.status(409).json({ erreur: 'Ce pays existe déjà.' });
    const ins = await q(
      `INSERT INTO bo_pays(iso, nom, indicatif, devise, langue, longueur_num, actif)
       VALUES ($1,$2,$3,$4,$5,$6,FALSE) RETURNING id`,
      [iso.toUpperCase(), nom, indicatif, devise || 'XOF', langue || 'fr', longueur_num || null]);
    await auditer(req, 'pays.cree', 'pays#' + ins.rows[0].id, { iso, nom });
    res.json({ ok: true, id: ins.rows[0].id });
  } catch (e) { console.error(e); res.status(500).json({ erreur: 'Erreur serveur.' }); }
});

// --- modifier / activer un pays ---
r.patch('/pays/:id', exige('pays.ecrire'), async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const permis = ['nom', 'indicatif', 'devise', 'langue', 'longueur_num', 'actif', 'reglementation'];
    const champs = [], params = []; let i = 1;
    permis.forEach(k => {
      if (req.body[k] !== undefined) {
        champs.push(k + '=$' + i);
        params.push(k === 'reglementation' ? JSON.stringify(req.body[k]) : req.body[k]); i++;
      }
    });
    if (!champs.length) return res.status(400).json({ erreur: 'Rien à modifier.' });
    champs.push('maj_le=now()');
    params.push(id);
    await q('UPDATE bo_pays SET ' + champs.join(', ') + ' WHERE id=$' + i, params);
    await auditer(req, 'pays.modifie', 'pays#' + id, req.body);
    res.json({ ok: true });
  } catch (e) { console.error(e); res.status(500).json({ erreur: 'Erreur serveur.' }); }
});

// --- opérateurs d'un pays ---
r.get('/pays/:iso/operateurs', exige('pays.lire'), async (req, res) => {
  try {
    const iso = req.params.iso.toUpperCase();
    // périmètre : un opérateur ne voit que son propre pays
    if (req.acces && !req.acces.interne && req.acces.perimetre.paysIso
        && req.acces.perimetre.paysIso !== iso)
      return res.status(403).json({ erreur: 'Hors de ton périmètre.' });
    const { rows } = await q(
      `SELECT o.id, o.code, o.nom, o.type, o.taux_reversement, o.actif, o.api_config, o.maj_le
         FROM bo_operateurs o JOIN bo_pays p ON p.id=o.pays_id
        WHERE p.iso=$1 ORDER BY o.actif DESC, o.nom`, [iso]);
    rows.forEach(o => { o.api_config = masquerApi(o.api_config); });
    res.json({ ok: true, operateurs: rows });
  } catch (e) { console.error(e); res.status(500).json({ erreur: 'Erreur serveur.' }); }
});

// --- créer un opérateur ---
r.post('/operateurs', exige('pays.ecrire'), async (req, res) => {
  try {
    const { pays_iso, code, nom, type, taux_reversement } = req.body || {};
    if (!pays_iso || !code || !nom) return res.status(400).json({ erreur: 'Pays, code et nom requis.' });
    const pays = await q('SELECT id FROM bo_pays WHERE iso=$1', [pays_iso.toUpperCase()]);
    if (!pays.rows.length) return res.status(400).json({ erreur: 'Pays inconnu.' });
    const ins = await q(
      `INSERT INTO bo_operateurs(pays_id, code, nom, type, taux_reversement, actif)
       VALUES ($1,$2,$3,$4,$5,FALSE) RETURNING id`,
      [pays.rows[0].id, code, nom, type || 'airtime', taux_reversement || null]);
    await auditer(req, 'operateur.cree', 'operateur#' + ins.rows[0].id, { pays_iso, code, nom });
    res.json({ ok: true, id: ins.rows[0].id });
  } catch (e) {
    if (e.code === '23505') return res.status(409).json({ erreur: 'Cet opérateur existe déjà pour ce pays.' });
    console.error(e); res.status(500).json({ erreur: 'Erreur serveur.' });
  }
});

// --- modifier / activer un opérateur ---
r.patch('/operateurs/:id', exige('pays.ecrire'), async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const permis = ['nom', 'type', 'taux_reversement', 'actif', 'api_config'];
    const champs = [], params = []; let i = 1;
    permis.forEach(k => {
      if (req.body[k] !== undefined) {
        champs.push(k + '=$' + i);
        params.push(k === 'api_config' ? JSON.stringify(req.body[k]) : req.body[k]); i++;
      }
    });
    if (!champs.length) return res.status(400).json({ erreur: 'Rien à modifier.' });
    champs.push('maj_le=now()');
    params.push(id);
    await q('UPDATE bo_operateurs SET ' + champs.join(', ') + ' WHERE id=$' + i, params);
    // ne jamais journaliser les secrets en clair
    const detail = Object.assign({}, req.body); if (detail.api_config) detail.api_config = '[masqué]';
    await auditer(req, 'operateur.modifie', 'operateur#' + id, detail);
    res.json({ ok: true });
  } catch (e) { console.error(e); res.status(500).json({ erreur: 'Erreur serveur.' }); }
});

// --- moyens de paiement d'un opérateur ---
r.get('/operateurs/:id/moyens', exige('pays.lire'), async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const { rows } = await q(
      'SELECT id, code, nom, couleur, actif FROM bo_moyens_paiement WHERE operateur_id=$1 ORDER BY nom', [id]);
    res.json({ ok: true, moyens: rows });
  } catch (e) { console.error(e); res.status(500).json({ erreur: 'Erreur serveur.' }); }
});

// --- ajouter un moyen de paiement ---
r.post('/operateurs/:id/moyens', exige('pays.ecrire'), async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const { code, nom, couleur } = req.body || {};
    if (!code || !nom) return res.status(400).json({ erreur: 'Code et nom requis.' });
    const ins = await q(
      'INSERT INTO bo_moyens_paiement(operateur_id, code, nom, couleur) VALUES ($1,$2,$3,$4) RETURNING id',
      [id, code, nom, couleur || null]);
    await auditer(req, 'moyen.cree', 'moyen#' + ins.rows[0].id, { operateur: id, code });
    res.json({ ok: true, id: ins.rows[0].id });
  } catch (e) {
    if (e.code === '23505') return res.status(409).json({ erreur: 'Ce moyen existe déjà.' });
    console.error(e); res.status(500).json({ erreur: 'Erreur serveur.' });
  }
});

module.exports = r;
