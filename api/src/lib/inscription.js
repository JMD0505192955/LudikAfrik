/* ============================================================
   Inscription des abonnés par code SMS (OTP).

   Vérifie qu'un numéro appartient bien à la personne qui s'inscrit.
   C'est DISTINCT de l'adaptateur "code" de facturation : ici on ne
   prélève rien, on valide une identité avant de créer/compléter
   la ligne "abonnes".

   S'appuie sur la pile existante : q() de lib/bd, table "abonnes".
   ============================================================ */
const crypto = require('crypto');
const { q } = require('../lib/bd');

/* --- réglages : ajustables ici, ou par variables d'environnement --- */
const CFG = {
  sel:            process.env.OTP_SEL || 'CHANGER_avant_production',
  dureeSec:       Number(process.env.OTP_DUREE_SEC || 300),   // 5 min
  longueur:       6,
  maxEssais:      5,
  parNumero:      { nb: 3,  fenetreSec: 3600 },  // 3 SMS / h / numéro
  parIp:          { nb: 10, fenetreSec: 3600 },  // 10 / h / IP
  delaiMinSec:    30,
  indicatifDefaut:'+226',
  smsConfigure:   process.env.OTP_SMS_CONFIGURE === 'true',
  modeDemo:       process.env.OTP_MODE_DEMO !== 'false',
};

/* --- indicatif -> pays (repli sur les marchés connus) --- */
function paysDe(tel) {
  if (tel.startsWith('+226')) return 'BF';
  if (tel.startsWith('+228')) return 'TG';
  if (tel.startsWith('+225')) return 'CI';
  if (tel.startsWith('+223')) return 'ML';
  if (tel.startsWith('+221')) return 'SN';
  return 'XX';
}

function normaliser(brut) {
  if (!brut) return null;
  let n = String(brut).trim().replace(/[\s\-().]/g, '');
  if (n.startsWith('00')) n = '+' + n.slice(2);
  if (!n.startsWith('+')) { n = n.replace(/^0+/, ''); n = CFG.indicatifDefaut + n; }
  return /^\+\d{8,15}$/.test(n) ? n : null;
}

function validerPseudo(brut) {
  if (!brut) return { ok: false, erreur: 'Pseudo requis.' };
  const p = String(brut).trim();
  if (p.length < 2 || p.length > 12) return { ok: false, erreur: 'Pseudo : de 2 à 12 caractères.' };
  if (!/^[\p{L}\p{N} _'\-]+$/u.test(p)) return { ok: false, erreur: 'Pseudo : caractères non autorisés.' };
  return { ok: true, pseudo: p };
}

const empreinte = (code) => crypto.createHash('sha256').update(code + '|' + CFG.sel).digest('hex');
function genererCode() {
  return String(crypto.randomInt(0, 10 ** CFG.longueur)).padStart(CFG.longueur, '0');
}

/* --- limitation d'envoi --- */
async function limiter(telephone, ip) {
  const d = await q('SELECT cree_le FROM otp_demandes WHERE telephone=$1 ORDER BY cree_le DESC LIMIT 1', [telephone]);
  if (d.rows.length) {
    const ecoule = (Date.now() - new Date(d.rows[0].cree_le).getTime()) / 1000;
    if (ecoule < CFG.delaiMinSec)
      return { ok: false, erreur: 'Patiente un instant avant de redemander un code.', attendreSec: Math.ceil(CFG.delaiMinSec - ecoule) };
  }
  const pn = await q("SELECT count(*)::int n FROM otp_demandes WHERE telephone=$1 AND cree_le > now() - ($2||' seconds')::interval", [telephone, CFG.parNumero.fenetreSec]);
  if (pn.rows[0].n >= CFG.parNumero.nb) return { ok: false, erreur: 'Trop de demandes pour ce numéro. Réessaie plus tard.' };
  if (ip) {
    const pi = await q("SELECT count(*)::int n FROM otp_demandes WHERE ip=$1 AND cree_le > now() - ($2||' seconds')::interval", [ip, CFG.parIp.fenetreSec]);
    if (pi.rows[0].n >= CFG.parIp.nb) return { ok: false, erreur: 'Trop de demandes depuis cet appareil. Réessaie plus tard.' };
  }
  return { ok: true };
}

/* --- l'envoi réel : SEULE fonction à brancher sur la passerelle --- */
async function envoyerSMS(telephone, message) {
  if (!CFG.smsConfigure) {
    console.log('[OTP SMS simulé] ' + telephone + ' : ' + message);
    return { ok: true, simule: true };
  }
  // À REMPLACER par l'appel à la passerelle (Orange BF, agrégateur…).
  // Les identifiants viendront avec le contrat opérateur.
  return { ok: false, erreur: 'Passerelle marquée active mais envoyerSMS() non implémentée.' };
}

/* ============================================================
   Étapes
   ============================================================ */
async function demander(telephone, ip) {
  const tel = normaliser(telephone);
  if (!tel) return { ok: false, code: 400, erreur: 'Numéro invalide.' };

  const rl = await limiter(tel, ip);
  if (!rl.ok) return { ok: false, code: 429, erreur: rl.erreur, attendreSec: rl.attendreSec };

  if (!CFG.smsConfigure && !CFG.modeDemo)
    return { ok: false, code: 503, erreur: 'Service SMS momentanément indisponible.' };

  const code = genererCode();
  const expire = new Date(Date.now() + CFG.dureeSec * 1000);

  await q('UPDATE otp_codes SET consomme=TRUE WHERE telephone=$1 AND consomme=FALSE', [tel]);
  await q('INSERT INTO otp_codes(telephone, empreinte, expire_le, ip) VALUES ($1,$2,$3,$4)', [tel, empreinte(code), expire, ip || null]);
  await q('INSERT INTO otp_demandes(telephone, ip) VALUES ($1,$2)', [tel, ip || null]);

  const msg = 'Ton code de verification est : ' + code + ' (valable ' + Math.round(CFG.dureeSec / 60) + ' min).';
  const envoi = await envoyerSMS(tel, msg);
  if (!envoi.ok) return { ok: false, code: 502, erreur: 'Échec de l\'envoi du SMS.' };

  const rep = { ok: true, telephone: tel, expireDansSec: CFG.dureeSec };
  if (envoi.simule && CFG.modeDemo) { rep.demo = true; rep.code = code; }
  return rep;
}

async function verifier(telephone, codeSaisi) {
  const tel = normaliser(telephone);
  if (!tel) return { ok: false, code: 400, erreur: 'Numéro invalide.' };
  if (!/^\d+$/.test(String(codeSaisi || ''))) return { ok: false, code: 400, erreur: 'Code invalide.' };

  const r = await q('SELECT * FROM otp_codes WHERE telephone=$1 AND consomme=FALSE ORDER BY cree_le DESC LIMIT 1', [tel]);
  if (!r.rows.length) return { ok: false, code: 400, erreur: 'Aucun code en attente. Redemande un code.' };
  const o = r.rows[0];

  if (new Date(o.expire_le).getTime() < Date.now()) {
    await q('UPDATE otp_codes SET consomme=TRUE WHERE id=$1', [o.id]);
    return { ok: false, code: 410, erreur: 'Code expiré. Redemande un code.' };
  }
  if (o.essais >= CFG.maxEssais) {
    await q('UPDATE otp_codes SET consomme=TRUE WHERE id=$1', [o.id]);
    return { ok: false, code: 429, erreur: 'Trop d\'essais. Redemande un code.' };
  }
  await q('UPDATE otp_codes SET essais=essais+1 WHERE id=$1', [o.id]);

  const a = Buffer.from(o.empreinte), b = Buffer.from(empreinte(String(codeSaisi)));
  const bon = a.length === b.length && crypto.timingSafeEqual(a, b);
  if (!bon) {
    const reste = CFG.maxEssais - (o.essais + 1);
    return { ok: false, code: 401, erreur: 'Code incorrect.' + (reste > 0 ? ' Il reste ' + reste + ' essai(s).' : ' Redemande un code.') };
  }
  await q('UPDATE otp_codes SET verifie=TRUE WHERE id=$1', [o.id]);
  return { ok: true, telephone: tel };
}

/* Finalise : complète ou crée la ligne "abonnes" (table existante). */
async function finaliser(telephone, pseudo) {
  const tel = normaliser(telephone);
  if (!tel) return { ok: false, code: 400, erreur: 'Numéro invalide.' };
  const vp = validerPseudo(pseudo);
  if (!vp.ok) return { ok: false, code: 400, erreur: vp.erreur };

  const r = await q('SELECT * FROM otp_codes WHERE telephone=$1 AND verifie=TRUE AND consomme=FALSE ORDER BY cree_le DESC LIMIT 1', [tel]);
  if (!r.rows.length) return { ok: false, code: 403, erreur: 'Vérification requise avant l\'inscription.' };

  // s'appuie sur la table abonnes existante : on renseigne le pseudo,
  // on ne recrée rien. statut 'essai' par défaut (déjà géré par le schéma).
  await q(
    `INSERT INTO abonnes (telephone, pays, pseudo, vu_le)
     VALUES ($1,$2,$3,now())
     ON CONFLICT (telephone) DO UPDATE SET pseudo=EXCLUDED.pseudo, vu_le=now()`,
    [tel, paysDe(tel), vp.pseudo]
  );
  await q('UPDATE otp_codes SET consomme=TRUE WHERE id=$1', [r.rows[0].id]);

  const masque = tel.slice(0, 6) + ' ** ** ' + tel.slice(-2);
  return { ok: true, telephone: tel, telephoneMasque: masque, pseudo: vp.pseudo };
}

module.exports = { normaliser, validerPseudo, empreinte, genererCode, demander, verifier, finaliser, CFG };
