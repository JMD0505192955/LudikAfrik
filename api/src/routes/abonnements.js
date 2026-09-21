/* ============================================================
   Routes abonnements / paiement.
   Monté :  app.use('/', require('./routes/abonnements'));

     GET  /operateur?telephone=       → pays + opérateur (pour l'affichage)
     GET  /pass                        → catalogue des forfaits
     POST /paiement/web               { telephone, forfait, reconduction }
        (après OTP validé) → déclenche le prélèvement airtime
     POST /paiement/code              { telephone, code }
        (canaux USSD/SMS) → valide le code reçu et active
     GET  /abonnement?telephone=       → statut actif/inactif
     POST /rappel/moov                 ← appelé par Moov (signé HMAC)
   ============================================================ */
'use strict';
const express = require('express');
const limite = require('express-rate-limit');
const ops = require('../lib/operateurs');
const pass = require('../lib/pass');
const moov = require('../lib/adaptateur-moov');
const abo = require('../lib/abonnements');
const { tracer } = require('../lib/auth');

const r = express.Router();

/* Identifier pays + opérateur (pour afficher "Moov Africa" avant paiement). */
r.get('/operateur', (req, res) => {
  const info = ops.identifier(req.query.telephone);
  res.status(info.ok ? 200 : 400).json(info);
});

/* Catalogue des pass. */
r.get('/pass', (_req, res) => {
  res.json({ ok: true, forfaits: Object.values(pass.FORFAITS) });
});

/* Statut d'abonnement. */
r.get('/abonnement', express.json(), async (req, res) => {
  try {
    const tel = ops.normaliser(req.query.telephone);
    if (!tel) return res.status(400).json({ erreur: 'Numéro invalide.' });
    res.json({ ok: true, ...(await abo.estActif(tel)) });
  } catch (e) { console.error('abonnement', e); res.status(500).json({ erreur: 'Erreur serveur.' }); }
});

const brute = limite({ windowMs: 15 * 60 * 1000, max: 20,
  message: { erreur: 'Trop de requêtes. Réessaie plus tard.' } });

/* Paiement WEB : suppose l'OTP déjà validé (via /inscription/verifier).
   Déclenche le prélèvement airtime chez l'opérateur. */
r.post('/paiement/web', brute, express.json(), async (req, res) => {
  try {
    const { telephone, forfait, reconduction } = req.body || {};
    const info = ops.identifier(telephone);
    if (!info.ok) return res.status(400).json(info);
    if (!info.facturable)
      return res.status(400).json({ erreur: 'Facturation non disponible pour ' + (info.operateur ? info.operateur.nom : 'cet opérateur') + '.' });
    const f = pass.FORFAITS[forfait];
    if (!f) return res.status(400).json({ erreur: 'Forfait inconnu.' });

    const motCle = pass.motCle(forfait, !!reconduction);
    const prel = await moov.prelever(info.telephone, { ...f, motCle });

    if (!prel.ok) {
      // pas encore branché ou échec : on le dit clairement
      return res.status(prel.enAttenteSpec ? 503 : 502).json({ erreur: prel.erreur });
    }
    const act = await abo.activer(info.telephone, forfait, !!reconduction, info.operateur.id, prel.reference);
    await tracer(req, 'paiement.web', info.telephone, { forfait, reconduction: !!reconduction });
    res.json({ ok: true, ...act });
  } catch (e) { console.error('paiement/web', e); res.status(500).json({ erreur: 'Erreur serveur.' }); }
});

/* Paiement par CODE (canaux USSD/SMS) : le client revient saisir son code. */
r.post('/paiement/code', brute, express.json(), async (req, res) => {
  try {
    const { telephone, code } = req.body || {};
    const out = await abo.validerCodeAcces(telephone, code);
    if (out.ok) await tracer(req, 'paiement.code', ops.normaliser(telephone));
    res.status(out.ok ? 200 : (out.code || 400)).json(out);
  } catch (e) { console.error('paiement/code', e); res.status(500).json({ erreur: 'Erreur serveur.' }); }
});

/* Rappel opérateur (Moov). Corps brut requis pour vérifier la signature HMAC. */
r.post('/rappel/moov', express.raw({ type: '*/*' }), async (req, res) => {
  try {
    const corps = req.body ? req.body.toString('utf8') : '';
    const signature = req.headers['x-moov-signature'] || req.headers['x-signature'] || '';
    const lu = moov.lireRappel(corps, signature);
    if (!lu.ok) return res.status(400).json({ erreur: lu.erreur });

    if (lu.statut === 'SUCCESS') {
      const mc = pass.lireMotCle(lu.motCle);
      if (mc) {
        // canaux USSD/SMS : on émet un code d'accès que le client saisira,
        // OU on active directement si le rappel suffit (selon spec Moov).
        // Ici, activation directe car le paiement est confirmé.
        await abo.activer(ops.normaliser(lu.telephone), mc.forfait, mc.reconduction, 'moov', lu.reference);
      }
    }
    res.json({ ok: true });  // toujours accuser réception à l'opérateur
  } catch (e) { console.error('rappel/moov', e); res.status(500).json({ erreur: 'Erreur serveur.' }); }
});

module.exports = r;
