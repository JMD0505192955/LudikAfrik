/* ============================================================
   Authentification & audit.
   - signer/verifier : jetons JWT pour le back office.
   - protege : middleware qui exige un jeton valide.
   - tracer : écrit une ligne dans le journal d'audit.
   ============================================================ */
'use strict';
const jwt = require('jsonwebtoken');
const { q } = require('./bd');

const SECRET = process.env.JWT_SECRET || 'CHANGER_ce_secret_en_production';
const DUREE  = process.env.JWT_DUREE  || '12h';

function signer(charge) {
  return jwt.sign(charge, SECRET, { expiresIn: DUREE });
}

function verifier(jeton) {
  try { return jwt.verify(jeton, SECRET); }
  catch (e) { return null; }
}

/* Middleware : n'autorise que les requêtes avec un jeton admin valide. */
function protege(req, res, next) {
  const brut = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  const charge = verifier(brut);
  if (!charge) return res.status(401).json({ erreur: 'Non autorisé.' });
  req.admin = charge;
  next();
}

/* Journal d'audit — ne lève jamais d'exception qui casserait la requête. */
async function tracer(req, action, cible, details) {
  try {
    const ip = (req && (req.headers['x-forwarded-for'] || '').split(',')[0].trim())
            || (req && req.socket && req.socket.remoteAddress) || null;
    await q('INSERT INTO journal(action, cible, details, ip) VALUES ($1,$2,$3,$4)',
      [action, cible || null, details ? JSON.stringify(details) : null, ip]);
  } catch (e) { console.error('[tracer]', e.message); }
}

module.exports = { signer, verifier, protege, tracer };
