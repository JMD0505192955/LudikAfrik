/* ============================================================
   Catalogue des pass Ludikafrik et mots-clés opérateurs.
   Conforme au flux Moov Togo (document du 09/09/2026).

   Les mots-clés portent : le service, le forfait, le mode.
   Un pass = un forfait + un mode (renouvelable ou non).
   ============================================================ */
'use strict';

/* Les trois forfaits Ludikafrik (le pass Compétition est réservé à Anagramme). */
const FORFAITS = {
  jour:    { code: 'jour',    nom: 'Pass Jour',    jours: 1,  prix: 100,  devise: 'XOF' },
  semaine: { code: 'semaine', nom: 'Pass Semaine', jours: 7,  prix: 300,  devise: 'XOF' },
  mois:    { code: 'mois',    nom: 'Pass Mois',    jours: 30, prix: 1000, devise: 'XOF' },
};

/* Mots-clés Moov pour Ludikafrik (tableau 3 du document).
   Clé = mot-clé exact ; valeur = forfait + reconduction. */
const MOTS_CLES = {
  // renouvelables
  LUDIK1R:  { forfait: 'jour',    reconduction: true },
  LUDIK7R:  { forfait: 'semaine', reconduction: true },
  LUDIK30R: { forfait: 'mois',    reconduction: true },
  // non renouvelables
  LUDIK1:   { forfait: 'jour',    reconduction: false },
  LUDIK7:   { forfait: 'semaine', reconduction: false },
  LUDIK30:  { forfait: 'mois',    reconduction: false },
};

/* Mot-clé attendu pour un forfait + un mode. */
function motCle(forfait, reconduction) {
  const suffixe = { jour: '1', semaine: '7', mois: '30' }[forfait];
  if (!suffixe) return null;
  return 'LUDIK' + suffixe + (reconduction ? 'R' : '');
}

/* Interprète un mot-clé reçu (canaux SMS/USSD). Insensible à la casse. */
function lireMotCle(brut) {
  const k = String(brut || '').trim().toUpperCase();
  const m = MOTS_CLES[k];
  if (!m) return null;
  return { motCle: k, forfait: m.forfait, reconduction: m.reconduction, ...FORFAITS[m.forfait] };
}

module.exports = { FORFAITS, MOTS_CLES, motCle, lireMotCle };
