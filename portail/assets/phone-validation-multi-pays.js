/* ============================================================
   phone-validation-multi-pays.js
   Référentiel centralisé de validation des numéros de téléphone.
   13 pays, 5 structures de numérotation (voir Annexe A).

   Indépendant de tout prestataire de paiement.

   API publique :
     validatePhone(iso, numeroNational) -> { valide, operateur, erreur }
     expectedLength(iso)               -> longueur nationale attendue
     listCountries()                   -> liste des pays (pour le sélecteur)
     detectOperateur(iso, numero)      -> nom de l'opérateur ou null
   ============================================================ */
(function (global) {
  'use strict';

  // --- Référentiel des pays -------------------------------------------------
  // structure : 'simple' | 'prefixe_fixe' | 'prefixe3' | 'zero_optionnel' | 'variable'
  // longueur  : longueur du numéro NATIONAL saisi (0 inclus quand il est optionnel)
  // operateurs: { nom: [préfixes...] }  — préfixes testés tels quels en tête du numéro
  var PAYS = {
    CI: {
      nom: "Côte d'Ivoire", indicatif: '+225', structure: 'simple', longueur: 10,
      operateurs: { Orange: ['07'], MTN: ['05'], Moov: ['01'] }
    },
    TG: {
      nom: 'Togo', indicatif: '+228', structure: 'simple', longueur: 8,
      operateurs: {
        'Yas (Togocom)': ['90', '91', '92', '93', '70', '71'],
        Moov: ['96', '97', '98', '99', '78', '79']
      }
    },
    BF: {
      nom: 'Burkina Faso', indicatif: '+226', structure: 'simple', longueur: 8,
      operateurs: {
        Orange: ['05', '06', '07', '54', '55', '56', '57', '74', '75', '76', '77'],
        'Moov (Onatel)': ['01', '02', '03', '60', '61', '62', '63', '70', '71', '72', '73'],
        Telecel: ['08', '09', '58', '64', '65', '66', '67', '68', '78', '79']
      }
    },
    CF: {
      nom: 'RCA', indicatif: '+236', structure: 'simple', longueur: 8,
      operateurs: { Telecel: ['70', '75'], Orange: ['72'], Moov: ['77'] }
    },
    NE: {
      nom: 'Niger', indicatif: '+227', structure: 'simple', longueur: 8,
      operateurs: {
        Airtel: ['90', '91', '92', '96', '97', '98', '99'],
        'Orange (Zamani)': ['93', '94', '95'],
        'Moov (Atlantique)': ['88', '89'],
        SahelCom: ['80', '83']
      }
    },
    ML: {
      nom: 'Mali', indicatif: '+223', structure: 'simple', longueur: 8,
      // Telecel (50,51) testé en priorité — cf. chevauchement Malitel/Telecel sur le 5
      operateurs: {
        Telecel: ['50', '51'],
        'Malitel (Moov)': ['60', '61', '62', '63', '64', '65', '66', '67', '68', '69'],
        Orange: ['70', '71', '72', '73', '74', '75', '76', '77', '78', '79',
                 '82', '83', '84', '90', '91', '92', '93', '94']
      }
    },
    SN: {
      nom: 'Sénégal', indicatif: '+221', structure: 'simple', longueur: 9,
      operateurs: {
        'Orange (Sonatel)': ['77', '78'], Free: ['76'], Expresso: ['70'],
        'Promobile/Hayo': ['75', '72']
      }
    },
    BJ: {
      nom: 'Bénin', indicatif: '+229', structure: 'prefixe_fixe', longueur: 10,
      prefixeFixe: '01',   // bloc fixe identique pour tous, puis sous-préfixe
      operateurs: {
        MTN: ['97', '96', '61', '62', '51'],
        Moov: ['95', '94', '66', '67'],
        Celtiis: ['40', '41', '42']
      }
    },
    GN: {
      nom: 'Guinée-Conakry', indicatif: '+224', structure: 'prefixe3', longueur: 9,
      operateurs: { Orange: ['61', '62'], 'MTN Areeba': ['66'], Cellcom: ['65'] }
    },
    GA: {
      nom: 'Gabon', indicatif: '+241', structure: 'zero_optionnel', longueur: 9,
      operateurs: { Moov: ['62', '65', '66'], Airtel: ['74', '76', '77'] }
    },
    CD: {
      nom: 'RDC', indicatif: '+243', structure: 'zero_optionnel', longueur: 9,
      operateurs: {
        Vodacom: ['81', '82'], Orange: ['84', '85', '89'],
        Airtel: ['97', '98', '99'], Africell: ['90', '91']
      }
    },
    CG: {
      nom: 'Congo-Brazzaville', indicatif: '+242', structure: 'zero_optionnel', longueur: 9,
      operateurs: { MTN: ['06', '09'], Airtel: ['04', '05', '07'] }
    },
    CM: {
      nom: 'Cameroun', indicatif: '+237', structure: 'variable', longueur: 9,
      // mélange de préfixes 2 et 3 chiffres — testés du plus long au plus court
      operateurs: {
        MTN: ['650', '651', '652', '653', '654', '680', '681', '682', '683', '67'],
        Orange: ['655', '656', '657', '658', '659', '640', '641', '642', '69'],
        Nexttel: ['66'], Camtel: ['620'] }
    }
  };

  // ordre d'affichage dans le sélecteur (marchés prioritaires en tête)
  var ORDRE = ['CI', 'TG', 'BF', 'ML', 'SN', 'BJ', 'NE', 'CF', 'GN', 'GA', 'CD', 'CG', 'CM'];

  // --- Helpers --------------------------------------------------------------
  function chiffresSeuls(s) { return String(s || '').replace(/\D/g, ''); }

  // longueur nationale attendue pour piloter le maxlength du champ
  function expectedLength(iso) {
    var p = PAYS[iso];
    return p ? p.longueur : 15;
  }

  // détecte l'opérateur en testant les préfixes (les plus longs d'abord)
  function detectOperateur(iso, numero) {
    var p = PAYS[iso];
    if (!p) return null;
    var n = chiffresSeuls(numero);

    // structure "zéro optionnel" : on retire un 0 initial pour tester le préfixe
    if (p.structure === 'zero_optionnel' && n.charAt(0) === '0') n = n.slice(1);

    // structure "préfixe fixe" (Bénin) : le bloc fixe précède le sous-préfixe
    if (p.structure === 'prefixe_fixe' && p.prefixeFixe) {
      if (n.indexOf(p.prefixeFixe) === 0) n = n.slice(p.prefixeFixe.length);
    }

    // rassembler tous les préfixes, triés par longueur décroissante
    var candidats = [];
    Object.keys(p.operateurs).forEach(function (op) {
      p.operateurs[op].forEach(function (pref) { candidats.push({ op: op, pref: pref }); });
    });
    candidats.sort(function (a, b) { return b.pref.length - a.pref.length; });

    for (var i = 0; i < candidats.length; i++) {
      if (n.indexOf(candidats[i].pref) === 0) return candidats[i].op;
    }
    return null;
  }

  // valide un numéro national pour un pays donné
  function validatePhone(iso, numeroNational) {
    var p = PAYS[iso];
    if (!p) return { valide: false, operateur: null, erreur: 'Pays non pris en charge.' };

    var n = chiffresSeuls(numeroNational);
    if (!n) return { valide: false, operateur: null, erreur: 'Entre ton numéro.' };

    // longueur exacte attendue
    if (n.length < p.longueur)
      return { valide: false, operateur: null,
               erreur: 'Numéro incomplet (' + p.longueur + ' chiffres attendus).' };
    if (n.length > p.longueur)
      return { valide: false, operateur: null,
               erreur: 'Numéro trop long (' + p.longueur + ' chiffres attendus).' };

    // structure "zéro optionnel" : le premier chiffre doit être 0 en national
    if (p.structure === 'zero_optionnel' && n.charAt(0) !== '0')
      return { valide: false, operateur: null, erreur: 'Le numéro national commence par 0.' };

    var op = detectOperateur(iso, n);
    if (!op)
      return { valide: false, operateur: null,
               erreur: 'Préfixe inconnu pour ' + p.nom + '. Vérifie ton numéro.' };

    // numéro international complet, sans le 0 national des structures "zéro optionnel"
    var national = n;
    if (p.structure === 'zero_optionnel' && national.charAt(0) === '0')
      national = national.slice(1);
    var international = p.indicatif + national;

    return { valide: true, operateur: op, erreur: null,
             international: international, indicatif: p.indicatif };
  }

  // liste des pays pour le sélecteur { iso, nom, indicatif, longueur }
  function listCountries() {
    return ORDRE.filter(function (iso) { return PAYS[iso]; })
      .map(function (iso) {
        var p = PAYS[iso];
        return { iso: iso, nom: p.nom, indicatif: p.indicatif, longueur: p.longueur };
      });
  }

  var API = { validatePhone: validatePhone, expectedLength: expectedLength,
              listCountries: listCountries, detectOperateur: detectOperateur, PAYS: PAYS };

  // export universel (navigateur + module)
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  global.PhoneValidation = API;

})(typeof window !== 'undefined' ? window : this);
