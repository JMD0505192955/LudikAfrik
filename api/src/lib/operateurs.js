/* ============================================================
   Pays & opérateurs — déduits de l'indicatif du numéro.
   JAMAIS d'une déclaration de l'utilisateur.

   Ajouter un pays = ajouter une entrée ici. Le reste ne bouge pas.
   Chaque opérateur porte l'adaptateur de facturation à utiliser.
   ============================================================ */
'use strict';

/* Un pays : indicatif, nom, devise, et ses opérateurs.
   Un opérateur : préfixes de numéro, nom affiché, adaptateur de paiement. */
const PAYS = [
  {
    code: 'TG', indicatif: '+228', nom: 'Togo', devise: 'XOF',
    operateurs: [
      // Moov Africa Togo : préfixes 70,71,79,90,91,96,97,98,99 (indicatifs mobiles usuels)
      { id: 'moov-tg', nom: 'Moov Africa', prefixes: ['70','71','79','98','99'], adaptateur: 'moov' },
      { id: 'yas-tg',  nom: 'Yas (Togocom)', prefixes: ['90','91','92','93','96','97'], adaptateur: 'aucun' },
    ],
  },
  {
    code: 'BF', indicatif: '+226', nom: 'Burkina Faso', devise: 'XOF',
    operateurs: [
      { id: 'orange-bf', nom: 'Orange', prefixes: ['06','07','54','55','56','57','64','65','66','67'], adaptateur: 'aucun' },
      { id: 'moov-bf',   nom: 'Moov Africa', prefixes: ['01','02','03','50','51','52','53','60','61','62','63'], adaptateur: 'moov' },
      { id: 'telecel-bf',nom: 'Telecel', prefixes: ['04','05','44','45','70','71','72'], adaptateur: 'aucun' },
    ],
  },
  {
    code: 'CI', indicatif: '+225', nom: "Côte d'Ivoire", devise: 'XOF',
    operateurs: [
      { id: 'orange-ci', nom: 'Orange', prefixes: ['07','08','09','47','48','49','57','58','59','77','78','79'], adaptateur: 'aucun' },
      { id: 'mtn-ci',    nom: 'MTN', prefixes: ['05','04','06','44','45','46','54','55','56','64','65','66','74','75','76'], adaptateur: 'aucun' },
      { id: 'moov-ci',   nom: 'Moov Africa', prefixes: ['01','02','03','40','41','42','43','50','51','52','53','60','61','62','63'], adaptateur: 'moov' },
    ],
  },
  {
    code: 'ML', indicatif: '+223', nom: 'Mali', devise: 'XOF',
    operateurs: [
      { id: 'orange-ml', nom: 'Orange', prefixes: ['07','08','09','44','45','46','47','48','49','70','71','72','73','74','75','76','77','78','79','90','91','92','93','94'], adaptateur: 'aucun' },
      { id: 'moov-ml',   nom: 'Moov Africa', prefixes: ['05','06','50','51','52','53','54','55','56','57','58','59','60','61','62','63','64','65','66','95','96','97','98','99'], adaptateur: 'moov' },
    ],
  },
  {
    code: 'SN', indicatif: '+221', nom: 'Sénégal', devise: 'XOF',
    operateurs: [
      { id: 'orange-sn', nom: 'Orange', prefixes: ['77','78'], adaptateur: 'aucun' },
      { id: 'free-sn',   nom: 'Free', prefixes: ['76'], adaptateur: 'aucun' },
      { id: 'expresso-sn', nom: 'Expresso', prefixes: ['70'], adaptateur: 'aucun' },
    ],
  },
  {
    code: 'BJ', indicatif: '+229', nom: 'Bénin', devise: 'XOF',
    operateurs: [
      { id: 'mtn-bj',  nom: 'MTN', prefixes: ['50','51','52','53','54','56','57','59','60','61','62','66','67','69','90','91','96','97'], adaptateur: 'aucun' },
      { id: 'moov-bj', nom: 'Moov Africa', prefixes: ['40','41','42','43','44','46','47','48','49','63','64','65','68','94','95','98','99'], adaptateur: 'moov' },
    ],
  },
];

/* Normalise vers E.164 (+228…). indicatifDefaut si le + manque. */
function normaliser(brut, indicatifDefaut) {
  if (!brut) return null;
  let n = String(brut).trim().replace(/[\s\-().]/g, '');
  if (n.startsWith('00')) n = '+' + n.slice(2);
  if (!n.startsWith('+')) { n = n.replace(/^0+/, ''); n = (indicatifDefaut || '+228') + n; }
  return /^\+\d{8,15}$/.test(n) ? n : null;
}

/* Retrouve le pays d'un numéro E.164. */
function paysDe(telephone) {
  return PAYS.find(p => telephone.startsWith(p.indicatif)) || null;
}

/* Retrouve l'opérateur : d'abord le pays, puis les 2 premiers chiffres locaux. */
function operateurDe(telephone) {
  const pays = paysDe(telephone);
  if (!pays) return { pays: null, operateur: null };
  const local = telephone.slice(pays.indicatif.length); // chiffres après l'indicatif
  const debut2 = local.slice(0, 2);
  const op = pays.operateurs.find(o => o.prefixes.includes(debut2)) || null;
  return { pays, operateur: op };
}

/* Vue "publique" pour le portail : ce qu'on affiche à l'utilisateur. */
function identifier(brut) {
  const tel = normaliser(brut);
  if (!tel) return { ok: false, erreur: 'Numéro invalide.' };
  const { pays, operateur } = operateurDe(tel);
  if (!pays) return { ok: false, erreur: 'Pays non pris en charge pour le moment.' };
  return {
    ok: true,
    telephone: tel,
    pays: { code: pays.code, nom: pays.nom, devise: pays.devise },
    operateur: operateur ? { id: operateur.id, nom: operateur.nom, adaptateur: operateur.adaptateur } : null,
    // facturation possible seulement si un adaptateur est branché
    facturable: !!(operateur && operateur.adaptateur !== 'aucun'),
  };
}

module.exports = { PAYS, normaliser, paysDe, operateurDe, identifier };
