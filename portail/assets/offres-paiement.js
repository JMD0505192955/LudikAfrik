/* ============================================================
   offres-paiement.js
   Référentiel des offres de paiement par PAYS et OPÉRATEUR.

   Chaque couple (pays, opérateur) définit :
     - ses forfaits (code, libellé, durée, prix, devise)
     - ses mots-clés SMS/USSD (par forfait + mode d'abonnement)
     - les canaux disponibles (web, ussd, sms)
     - le type d'adaptateur de facturation (airtime opérateur / mobile money)
     - le short code et le code USSD (renseignés quand l'opérateur les fournit)

   Extensible : ajouter un pays/opérateur = ajouter une entrée, sans
   toucher au parcours. Indépendant du portail et du serveur.

   API :
     offresPour(iso, operateurId)    -> offre complète ou null
     forfaitsPour(iso, operateurId)  -> liste des forfaits affichables
     motCle(iso, operateurId, forfaitCode, renouvelable) -> mot-clé
     canauxPour(iso, operateurId)    -> ['web','ussd','sms']
     estFacturable(iso, operateurId) -> booléen (contrat actif)
   ============================================================ */
(function (global) {
  'use strict';

  // Le référentiel. Une clé "ISO:operateurId" par offre.
  // actif=false : opérateur détecté et affiché, mais pas encore de contrat
  //               -> accès libre au catalogue, pas de tunnel de paiement.
  var OFFRES = {

    // ---- TOGO / MOOV (spécifications du 09/09/2026, contrat en cours) ----
    'TG:moov-tg': {
      pays: 'Togo', iso: 'TG', operateur: 'Moov Africa Togo', operateurId: 'moov-tg',
      devise: 'XOF', actif: true,
      adaptateur: 'airtime',       // API de paiement airtime Moov
      canaux: ['web', 'ussd', 'sms'],
      shortCode: null,             // à renseigner : Moov doit confirmer le short code XXX
      ussd: null,                  // à renseigner : *XXX#
      prefixeMotCle: 'LUDIK',      // LUDIK1R, LUDIK7, ...
      forfaits: [
        { code: 'jour',    libelle: 'Pass Jour',    duree_jours: 1,  prix: 100,  avantage: 'Accès illimité 24 h' },
        { code: 'semaine', libelle: 'Pass Semaine', duree_jours: 7,  prix: 300,  avantage: 'Accès illimité 7 jours' },
        { code: 'mois',    libelle: 'Pass Mois',    duree_jours: 30, prix: 1000, avantage: 'Accès illimité 30 jours' }
      ],
      // mots-clés exacts du document Moov (Ludikafrik)
      motsCles: {
        jour:    { renouvelable: 'LUDIK1R',  unique: 'LUDIK1'  },
        semaine: { renouvelable: 'LUDIK7R',  unique: 'LUDIK7'  },
        mois:    { renouvelable: 'LUDIK30R', unique: 'LUDIK30' }
      }
    },

    // ---- Exemples de futurs marchés (contrats non signés -> actif:false) ----
    // Ils sont détectés et affichés, mais l'accès reste libre sans paiement.

    // ---- CÔTE D'IVOIRE / agrégateur MOBILE MONEY (Orange, MTN, Moov, Wave) ----
    // Un seul agrégateur couvre les 4 services. L'offre est la même quel que
    // soit l'opérateur du numéro : le joueur choisit son moyen de paiement.
    'CI:agregateur-ci': {
      pays: "Côte d'Ivoire", iso: 'CI', operateur: 'Mobile Money', operateurId: 'agregateur-ci',
      devise: 'XOF', actif: true,
      adaptateur: 'mobilemoney',
      canaux: ['web'],            // mobile money : paiement en ligne uniquement
      shortCode: null, ussd: null, prefixeMotCle: 'LUDIK',
      // services mobile money proposés par l'agrégateur
      servicesMomo: [
        { id: 'orange', nom: 'Orange Money', couleur: '#ff7900' },
        { id: 'mtn',    nom: 'MTN MoMo',      couleur: '#ffcc00' },
        { id: 'moov',   nom: 'Moov Money',    couleur: '#0a6cb0' },
        { id: 'wave',   nom: 'Wave',          couleur: '#1dc3ec' }
      ],
      forfaits: [
        { code: 'jour',    libelle: 'Pass Jour',    duree_jours: 1,  prix: 100,  avantage: 'Accès illimité 24 h' },
        { code: 'semaine', libelle: 'Pass Semaine', duree_jours: 7,  prix: 300,  avantage: 'Accès illimité 7 jours' },
        { code: 'mois',    libelle: 'Pass Mois',    duree_jours: 30, prix: 1000, avantage: 'Accès illimité 30 jours' }
      ],
      motsCles: {
        jour:    { renouvelable: 'LUDIK1R',  unique: 'LUDIK1'  },
        semaine: { renouvelable: 'LUDIK7R',  unique: 'LUDIK7'  },
        mois:    { renouvelable: 'LUDIK30R', unique: 'LUDIK30' }
      }
    },

    // Exemple : un marché via agrégateur mobile money plutôt qu'airtime opérateur.
    'SN:orange-sn': {
      pays: 'Sénégal', iso: 'SN', operateur: 'Orange Sénégal', operateurId: 'orange-sn',
      devise: 'XOF', actif: false,
      adaptateur: 'mobilemoney',   // agrégateur (Wave, etc.) au lieu d'airtime
      canaux: ['web'], shortCode: null, ussd: null, prefixeMotCle: 'LUDIK',
      forfaits: [
        { code: 'jour',    libelle: 'Pass Jour',    duree_jours: 1,  prix: 100,  avantage: 'Accès illimité 24 h' },
        { code: 'semaine', libelle: 'Pass Semaine', duree_jours: 7,  prix: 300,  avantage: 'Accès illimité 7 jours' },
        { code: 'mois',    libelle: 'Pass Mois',    duree_jours: 30, prix: 1000, avantage: 'Accès illimité 30 jours' }
      ],
      motsCles: {
        jour:    { renouvelable: 'LUDIK1R',  unique: 'LUDIK1'  },
        semaine: { renouvelable: 'LUDIK7R',  unique: 'LUDIK7'  },
        mois:    { renouvelable: 'LUDIK30R', unique: 'LUDIK30' }
      }
    }
  };

  function cle(iso, opId) { return iso + ':' + opId; }

  function offresPour(iso, opId) {
    return OFFRES[cle(iso, opId)] || null;
  }
  function forfaitsPour(iso, opId) {
    var o = offresPour(iso, opId);
    return o ? o.forfaits.slice() : [];
  }
  function motCle(iso, opId, forfaitCode, renouvelable) {
    var o = offresPour(iso, opId);
    if (!o || !o.motsCles[forfaitCode]) return null;
    return o.motsCles[forfaitCode][renouvelable ? 'renouvelable' : 'unique'];
  }
  function canauxPour(iso, opId) {
    var o = offresPour(iso, opId);
    return o ? o.canaux.slice() : [];
  }
  function estFacturable(iso, opId) {
    var o = offresPour(iso, opId);
    return !!(o && o.actif);
  }
  function adaptateurDe(iso, opId) {
    var o = offresPour(iso, opId);
    return o ? o.adaptateur : null;
  }
  // services mobile money d'un agrégateur (Orange, MTN, Moov, Wave...)
  function servicesMomo(iso, opId) {
    var o = offresPour(iso, opId);
    return (o && o.servicesMomo) ? o.servicesMomo.slice() : [];
  }
  // trouver l'offre agrégateur d'un pays (indépendante de l'opérateur du numéro)
  function offreAgregateur(iso) {
    for (var k in OFFRES) {
      if (OFFRES[k].iso === iso && OFFRES[k].adaptateur === 'mobilemoney' && OFFRES[k].actif)
        return OFFRES[k];
    }
    return null;
  }

  var API = {
    OFFRES: OFFRES,
    offresPour: offresPour,
    forfaitsPour: forfaitsPour,
    motCle: motCle,
    canauxPour: canauxPour,
    estFacturable: estFacturable,
    adaptateurDe: adaptateurDe,
    servicesMomo: servicesMomo,
    offreAgregateur: offreAgregateur
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  global.OffresPaiement = API;

})(typeof window !== 'undefined' ? window : this);
