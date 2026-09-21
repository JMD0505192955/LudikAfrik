/* ============================================================
   Adaptateur Moov Africa — facturation par airtime.

   Deux points restent à brancher quand Moov livre ses specs
   (section 8 du document) : preleverAirtime() et la lecture du
   rappel de confirmation. Le reste de la logique est prêt.

   Le socle ne connaît que trois verbes :
     - instructions() : quoi afficher/faire selon le canal
     - prelever()     : déclencher le paiement
     - lireRappel()   : interpréter la confirmation opérateur
   ============================================================ */
'use strict';
const crypto = require('crypto');

const CFG = {
  // fournis par Moov (section 8). Laissés vides tant que non reçus.
  shortCode:  process.env.MOOV_SHORTCODE  || 'XXX',
  ussd:       process.env.MOOV_USSD       || '*XXX#',
  apiPaiement:process.env.MOOV_API_PAIEMENT || '',   // URL de l'API airtime
  apiCle:     process.env.MOOV_API_CLE    || '',
  secretRappel: process.env.MOOV_SECRET_RAPPEL || '',// pour vérifier la signature HMAC
  configure:  process.env.MOOV_CONFIGURE === 'true',
};

/* Ce qu'on affiche au client selon le canal choisi. */
function instructions(canal, pass) {
  if (canal === 'web') {
    return { canal: 'web',
      etapes: ['Saisis ton numéro Moov', 'Reçois un code par SMS', 'Renseigne le code'] };
  }
  if (canal === 'ussd') {
    return { canal: 'ussd',
      composer: CFG.ussd,
      message: 'Compose ' + CFG.ussd + ', choisis Ludikafrik puis ton forfait. '
             + 'Tu recevras un SMS avec un CODE à saisir ici.' };
  }
  if (canal === 'sms') {
    return { canal: 'sms',
      shortCode: CFG.shortCode,
      motCle: pass && pass.motCle,
      message: 'Envoie ' + (pass && pass.motCle) + ' au ' + CFG.shortCode + '. '
             + 'Tu recevras un SMS avec un CODE à saisir ici.' };
  }
  return { erreur: 'Canal inconnu.' };
}

/* Déclenche le prélèvement airtime (canal WEB, après OTP validé).
   Renvoie { ok, reference } ou { ok:false, erreur }. */
async function prelever(telephone, pass) {
  if (!CFG.configure) {
    // pas encore branché : on renvoie un état explicite, PAS un faux succès
    return { ok: false, enAttenteSpec: true,
      erreur: 'API de paiement Moov non encore configurée.' };
  }
  // ---- À REMPLACER par l'appel réel à l'API airtime Moov ----
  // const r = await fetch(CFG.apiPaiement, { method:'POST',
  //   headers:{ 'Authorization':'Bearer '+CFG.apiCle, 'Content-Type':'application/json' },
  //   body: JSON.stringify({ msisdn: telephone, montant: pass.prix, devise: pass.devise,
  //                          motcle: pass.motCle }) });
  // if (!r.ok) return { ok:false, erreur:'HTTP '+r.status };
  // const j = await r.json();
  // return { ok: j.statut==='SUCCESS', reference: j.reference };
  return { ok: false, erreur: 'prelever() non implémentée.' };
}

/* Vérifie la signature HMAC d'un rappel opérateur puis l'interprète.
   Le corps brut (string) et l'en-tête de signature viennent de la requête. */
function lireRappel(corpsBrut, signatureRecue) {
  if (!CFG.secretRappel) return { ok: false, erreur: 'Secret de rappel non configuré.' };
  const attendue = crypto.createHmac('sha256', CFG.secretRappel).update(corpsBrut).digest('hex');
  const a = Buffer.from(attendue), b = Buffer.from(String(signatureRecue || ''));
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b))
    return { ok: false, erreur: 'Signature invalide.' };
  let data;
  try { data = JSON.parse(corpsBrut); } catch (e) { return { ok: false, erreur: 'Corps illisible.' }; }
  // structure supposée ; à ajuster selon la spec Moov reçue
  return { ok: true,
    reference: data.reference,
    telephone: data.msisdn,
    statut: data.statut,                 // SUCCESS | FAILED …
    motCle: data.motcle || null };
}

module.exports = { CFG, instructions, prelever, lireRappel };
