/* ============================================================
   Back-office — Module 1 : Accès & rôles.
   Monté : app.use('/bo', require('./routes/bo-acces'));

     GET  /bo/roles                 liste des rôles + permissions
     GET  /bo/admins                liste des comptes admin
     POST /bo/admins                créer un compte (admin ou opérateur)
     PATCH /bo/admins/:id           modifier rôle/périmètre/suspension
     GET  /bo/audit                 journal d'audit (paginé)
   Toutes protégées par jeton + permission.
   ============================================================ */
'use strict';
const express = require('express');
const bcrypt = require('bcryptjs');
const { q } = require('../lib/bd');
const { protege } = require('../lib/auth');
const { exige, auditer, filtrePerimetre } = require('../lib/bo-acces');

const r = express.Router();
r.use(express.json());
r.use(protege);   // toutes les routes BO exigent un jeton admin valide

// --- rôles + permissions (pour les écrans de gestion) ---
r.get('/roles', exige('acces.lire'), async (_req, res) => {
  try {
    const roles = await q('SELECT id, code, libelle, interne FROM bo_roles ORDER BY interne DESC, id');
    const rp = await q(
      `SELECT r.code AS role, p.code AS perm, p.libelle, p.module
         FROM bo_role_permissions rp
         JOIN bo_roles r ON r.id=rp.role_id
         JOIN bo_permissions p ON p.id=rp.permission_id
        ORDER BY p.module`);
    const parRole = {};
    rp.rows.forEach(x => { (parRole[x.role] = parRole[x.role] || []).push({ code: x.perm, libelle: x.libelle, module: x.module }); });
    res.json({ ok: true, roles: roles.rows.map(ro => ({ ...ro, permissions: parRole[ro.code] || [] })) });
  } catch (e) { console.error(e); res.status(500).json({ erreur: 'Erreur serveur.' }); }
});

// --- liste des comptes admin ---
r.get('/admins', exige('acces.lire'), async (_req, res) => {
  try {
    const { rows } = await q(
      `SELECT a.id, a.nom, a.courriel, a.actif, a.suspendu, a.pays_iso, a.operateur_id,
              r.code AS role, r.libelle AS role_libelle, a.vu_le, a.cree_le
         FROM administrateurs a
         LEFT JOIN bo_roles r ON r.id=a.role_id
        ORDER BY a.cree_le DESC`);
    res.json({ ok: true, admins: rows });
  } catch (e) { console.error(e); res.status(500).json({ erreur: 'Erreur serveur.' }); }
});

// --- créer un compte (admin interne OU opérateur partenaire) ---
r.post('/admins', exige('acces.ecrire'), async (req, res) => {
  try {
    const { nom, courriel, motdepasse, role_code, pays_iso, operateur_id } = req.body || {};
    if (!nom || !courriel || !motdepasse || String(motdepasse).length < 8)
      return res.status(400).json({ erreur: 'Nom, courriel et mot de passe (8+) requis.' });
    if (!role_code) return res.status(400).json({ erreur: 'Rôle requis.' });

    const role = await q('SELECT id, interne FROM bo_roles WHERE code=$1', [role_code]);
    if (!role.rows.length) return res.status(400).json({ erreur: 'Rôle inconnu.' });

    // un compte opérateur DOIT avoir un périmètre (pays + opérateur)
    if (role.rows[0].interne === false && (!pays_iso || !operateur_id))
      return res.status(400).json({ erreur: 'Un compte opérateur exige un pays et un opérateur.' });

    const existe = await q('SELECT 1 FROM administrateurs WHERE courriel=$1', [String(courriel).toLowerCase().trim()]);
    if (existe.rows.length) return res.status(409).json({ erreur: 'Ce courriel est déjà utilisé.' });

    const hash = await bcrypt.hash(String(motdepasse), 10);
    const ins = await q(
      `INSERT INTO administrateurs(nom, courriel, motdepasse, role, role_id, pays_iso, operateur_id, actif)
       VALUES ($1,$2,$3,$4,$5,$6,$7,TRUE) RETURNING id`,
      [String(nom).trim(), String(courriel).toLowerCase().trim(), hash, role_code,
       role.rows[0].id, pays_iso || null, operateur_id || null]);
    await auditer(req, 'admin.cree', 'admin#' + ins.rows[0].id, { courriel, role_code, pays_iso });
    res.json({ ok: true, id: ins.rows[0].id });
  } catch (e) { console.error(e); res.status(500).json({ erreur: 'Erreur serveur.' }); }
});

// --- modifier un compte (rôle, périmètre, suspension) ---
r.patch('/admins/:id', exige('acces.ecrire'), async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const { role_code, pays_iso, operateur_id, suspendu } = req.body || {};
    const champs = [], params = []; let i = 1;
    if (role_code !== undefined) {
      const role = await q('SELECT id FROM bo_roles WHERE code=$1', [role_code]);
      if (!role.rows.length) return res.status(400).json({ erreur: 'Rôle inconnu.' });
      champs.push('role=$' + i); params.push(role_code); i++;
      champs.push('role_id=$' + i); params.push(role.rows[0].id); i++;
    }
    if (pays_iso !== undefined)     { champs.push('pays_iso=$' + i); params.push(pays_iso || null); i++; }
    if (operateur_id !== undefined) { champs.push('operateur_id=$' + i); params.push(operateur_id || null); i++; }
    if (suspendu !== undefined)     { champs.push('suspendu=$' + i); params.push(!!suspendu); i++; }
    if (!champs.length) return res.status(400).json({ erreur: 'Rien à modifier.' });
    params.push(id);
    await q('UPDATE administrateurs SET ' + champs.join(', ') + ' WHERE id=$' + i, params);
    await auditer(req, 'admin.modifie', 'admin#' + id, { role_code, pays_iso, suspendu });
    res.json({ ok: true });
  } catch (e) { console.error(e); res.status(500).json({ erreur: 'Erreur serveur.' }); }
});

// --- journal d'audit ---
r.get('/audit', exige('audit.lire'), async (req, res) => {
  try {
    const page = Math.max(0, parseInt(req.query.page, 10) || 0);
    const PAGE = 40;
    const { rows } = await q(
      `SELECT admin_nom, action, ressource, ip, cree_le
         FROM bo_audit ORDER BY cree_le DESC LIMIT $1 OFFSET $2`,
      [PAGE, page * PAGE]);
    res.json({ ok: true, page, audit: rows });
  } catch (e) { console.error(e); res.status(500).json({ erreur: 'Erreur serveur.' }); }
});

module.exports = r;
