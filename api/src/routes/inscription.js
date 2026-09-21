/* ============================================================
   Inscription des abonnés par code SMS.
   Se monte comme les autres routes, dans serveur.js :

     app.use('/', require('./routes/inscription'));

   Expose (préfixe /inscription pour ne pas heurter /auth du back office) :
     POST /inscription/code       { telephone }
     POST /inscription/verifier   { telephone, code }
     POST /inscription/finaliser  { telephone, pseudo }
   ============================================================ */
const express = require('express');
const limite = require('express-rate-limit');
const ins = require('../lib/inscription');   // voir note d'emplacement en bas
const { tracer } = require('../lib/auth');

const r = express.Router();

/* Barrière large en plus de la limitation applicative par numéro :
   protège l'IP contre l'abus, comme la connexion du back office. */
const brute = limite({ windowMs: 15 * 60 * 1000, max: 30,
  message: { erreur: 'Trop de requêtes. Réessaie plus tard.' } });

function ip(req) {
  return (req.headers['x-forwarded-for'] || '').split(',')[0].trim()
      || req.socket.remoteAddress || null;
}

r.post('/inscription/code', brute, async (req, res) => {
  try {
    const out = await ins.demander(req.body && req.body.telephone, ip(req));
    res.status(out.ok ? 200 : (out.code || 400)).json(out);
  } catch (e) { console.error('inscription/code', e); res.status(500).json({ erreur: 'Erreur serveur.' }); }
});

r.post('/inscription/verifier', brute, async (req, res) => {
  try {
    const out = await ins.verifier(req.body && req.body.telephone, req.body && req.body.code);
    res.status(out.ok ? 200 : (out.code || 400)).json(out);
  } catch (e) { console.error('inscription/verifier', e); res.status(500).json({ erreur: 'Erreur serveur.' }); }
});

r.post('/inscription/finaliser', brute, async (req, res) => {
  try {
    const out = await ins.finaliser(req.body && req.body.telephone, req.body && req.body.pseudo);
    if (out.ok) await tracer(req, 'inscription.finalisee', out.telephone);
    res.status(out.ok ? 200 : (out.code || 400)).json(out);
  } catch (e) { console.error('inscription/finaliser', e); res.status(500).json({ erreur: 'Erreur serveur.' }); }
});

module.exports = r;
