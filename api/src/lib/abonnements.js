/* ============================================================
   Abonnements — orchestration des trois parcours de paiement.
   S'appuie sur : operateurs (pays/op), pass (forfaits/mots-clés),
   adaptateur-moov (facturation), bd (q/transaction).
   ============================================================ */
'use strict';
const crypto = require('crypto');
const { q, transaction } = require('./bd');
const ops = require('./operateurs');
const pass = require('./pass');
const moov = require('./adaptateur-moov');

/* Retrouve (ou crée) l'abonné, renvoie son id. */
async function abonneId(telephone, pays, operateur) {
  const r = await q('SELECT id FROM abonnes WHERE telephone=$1', [telephone]);
  if (r.rows.length) return r.rows[0].id;
  const c = await q(
    'INSERT INTO abonnes(telephone, pays, operateur, statut) VALUES ($1,$2,$3,$4) RETURNING id',
    [telephone, pays, operateur, 'essai']);
  return c.rows[0].id;
}

/* Active un abonnement après paiement confirmé. */
async function activer(telephone, forfaitCode, reconduction, operateurId, reference) {
  const f = pass.FORFAITS[forfaitCode];
  if (!f) return { ok: false, erreur: 'Forfait inconnu.' };
  const { pays, operateur } = ops.operateurDe(telephone);
  const paysCode = pays ? pays.code : 'XX';
  const opId = operateurId || (operateur && operateur.id) || null;

  return transaction(async (client) => {
    // abonné
    let id;
    const r = await client.query('SELECT id FROM abonnes WHERE telephone=$1', [telephone]);
    if (r.rows.length) { id = r.rows[0].id; }
    else {
      const c = await client.query(
        'INSERT INTO abonnes(telephone, pays, operateur, statut) VALUES ($1,$2,$3,$4) RETURNING id',
        [telephone, paysCode, opId, 'actif']);
      id = c.rows[0].id;
    }
    await client.query("UPDATE abonnes SET statut='actif', operateur=coalesce($2,operateur) WHERE id=$1", [id, opId]);

    const fin = new Date(Date.now() + f.jours * 86400000);
    await client.query(
      `INSERT INTO abonnements(abonne_id, pass, prix, devise, fin, reconduction, statut)
       VALUES ($1,$2,$3,$4,$5,$6,'actif')`,
      [id, forfaitCode, f.prix, f.devise, fin, !!reconduction]);

    // trace du prélèvement
    await client.query(
      `INSERT INTO prelevements(abonne_id, montant, devise, operateur, reference, statut, message)
       VALUES ($1,$2,$3,$4,$5,'reussi',$6)`,
      [id, f.prix, f.devise, opId, reference || null, pass.FORFAITS[forfaitCode].nom]);

    return { ok: true, forfait: f.nom, expire: fin.toISOString(), reconduction: !!reconduction };
  });
}

/* Un abonnement actif existe-t-il pour ce numéro ? */
async function estActif(telephone) {
  const r = await q(
    `SELECT ab.fin FROM abonnements ab JOIN abonnes a ON a.id=ab.abonne_id
      WHERE a.telephone=$1 AND ab.statut='actif' AND ab.fin > now()
      ORDER BY ab.fin DESC LIMIT 1`, [telephone]);
  if (!r.rows.length) return { actif: false };
  return { actif: true, expire: r.rows[0].fin };
}

/* --- CODES pour les canaux USSD et SMS ---
   Après paiement sur le téléphone, l'opérateur envoie au client un CODE.
   On stocke ce code (hashé) pour le valider quand il revient le saisir. */
function hashCode(code) {
  const sel = process.env.OTP_SEL || 'sel';
  return crypto.createHash('sha256').update(code + '|' + sel).digest('hex');
}

/* Enregistre un code d'accès émis par l'opérateur (appelé par le rappel). */
async function enregistrerCodeAcces(telephone, code, forfaitCode, reconduction, reference) {
  await q(
    `INSERT INTO codes_acces(telephone, code_hash, forfait, reconduction, reference, expire_le)
     VALUES ($1,$2,$3,$4,$5, now() + interval '24 hours')`,
    [telephone, hashCode(code), forfaitCode, !!reconduction, reference || null]);
  return { ok: true };
}

/* Le client revient saisir numéro + code : on valide et on active. */
async function validerCodeAcces(telephone, code) {
  const tel = ops.normaliser(telephone);
  if (!tel) return { ok: false, code: 400, erreur: 'Numéro invalide.' };
  const r = await q(
    `SELECT * FROM codes_acces WHERE telephone=$1 AND consomme=FALSE AND expire_le > now()
      ORDER BY cree_le DESC LIMIT 1`, [tel]);
  if (!r.rows.length) return { ok: false, code: 400, erreur: 'Aucun code en attente. Vérifie le SMS reçu.' };

  const c = r.rows[0];
  const a = Buffer.from(c.code_hash), b = Buffer.from(hashCode(String(code)));
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b))
    return { ok: false, code: 401, erreur: 'Code incorrect.' };

  await q('UPDATE codes_acces SET consomme=TRUE WHERE id=$1', [c.id]);
  const act = await activer(tel, c.forfait, c.reconduction, null, c.reference);
  return act.ok ? { ok: true, ...act } : { ok: false, code: 500, erreur: 'Activation impossible.' };
}

module.exports = { activer, estActif, enregistrerCodeAcces, validerCodeAcces, abonneId };
