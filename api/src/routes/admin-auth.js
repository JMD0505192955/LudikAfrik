/* ============================================================
   Connexion du back office (administrateurs).
   Monté dans serveur.js :  app.use('/admin', require('./routes/admin-auth'));

     POST /admin/connexion   { courriel, motdepasse }  → { ok, jeton, admin }
     GET  /admin/moi                                    → { ok, admin }   (protégé)
     POST /admin/init        { nom, courriel, motdepasse, cle }  → 1er admin
   ============================================================ */
'use strict';
const express = require('express');
const limite = require('express-rate-limit');
const bcrypt = require('bcryptjs');
const { q } = require('../lib/bd');
const { signer, protege, tracer } = require('../lib/auth');

const r = express.Router();
r.use(express.json());

/* Barrière anti-force brute sur la connexion. */
const brute = limite({ windowMs: 15 * 60 * 1000, max: 10,
  message: { erreur: 'Trop de tentatives. Réessaie dans quelques minutes.' } });

/* Connexion. */
r.post('/connexion', brute, async (req, res) => {
  try {
    const { courriel, motdepasse } = req.body || {};
    if (!courriel || !motdepasse) return res.status(400).json({ erreur: 'Identifiants requis.' });

    const a = await q('SELECT * FROM administrateurs WHERE courriel=$1 AND actif=TRUE', [String(courriel).toLowerCase().trim()]);
    // message volontairement identique que le compte existe ou non
    if (!a.rows.length) { await bcrypt.compare(motdepasse, '$2a$10$invalidinvalidinvalidinvalidin'); return res.status(401).json({ erreur: 'Identifiants incorrects.' }); }

    const ok = await bcrypt.compare(String(motdepasse), a.rows[0].motdepasse);
    if (!ok) return res.status(401).json({ erreur: 'Identifiants incorrects.' });

    await q('UPDATE administrateurs SET vu_le=now() WHERE id=$1', [a.rows[0].id]);
    await tracer(req, 'admin.connexion', a.rows[0].courriel);

    const jeton = signer({ id: a.rows[0].id, nom: a.rows[0].nom, role: a.rows[0].role });
    res.json({ ok: true, jeton, admin: { nom: a.rows[0].nom, courriel: a.rows[0].courriel, role: a.rows[0].role } });
  } catch (e) { console.error('connexion', e); res.status(500).json({ erreur: 'Erreur serveur.' }); }
});

/* Qui suis-je (vérifie le jeton). */
r.get('/moi', protege, (req, res) => {
  res.json({ ok: true, admin: req.admin });
});

/* Création du tout premier administrateur.
   Protégée par une clé d'installation (variable ADMIN_CLE_INIT) et refusée
   dès qu'un admin existe déjà. */
r.post('/init', async (req, res) => {
  try {
    const { nom, courriel, motdepasse, cle } = req.body || {};
    if (cle !== process.env.ADMIN_CLE_INIT || !process.env.ADMIN_CLE_INIT)
      return res.status(403).json({ erreur: 'Clé d\'installation invalide.' });

    const compte = await q('SELECT count(*)::int n FROM administrateurs');
    if (compte.rows[0].n > 0) return res.status(409).json({ erreur: 'Un administrateur existe déjà.' });

    if (!nom || !courriel || !motdepasse || String(motdepasse).length < 8)
      return res.status(400).json({ erreur: 'Nom, courriel et mot de passe (8+ caractères) requis.' });

    const hash = await bcrypt.hash(String(motdepasse), 10);
    await q('INSERT INTO administrateurs(nom, courriel, motdepasse, role) VALUES ($1,$2,$3,$4)',
      [String(nom).trim(), String(courriel).toLowerCase().trim(), hash, 'admin']);
    await tracer(req, 'admin.init', courriel);
    res.json({ ok: true, message: 'Administrateur créé. Vous pouvez vous connecter.' });
  } catch (e) { console.error('init', e); res.status(500).json({ erreur: 'Erreur serveur.' }); }
});

module.exports = r;
