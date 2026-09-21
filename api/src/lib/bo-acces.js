/* ============================================================
   Contrôle d'accès du back-office : rôles, permissions, périmètre.

   - charge les permissions d'un admin (via son rôle)
   - exige une permission pour une route (middleware `exige`)
   - applique le périmètre opérateur : un opérateur partenaire ne
     voit QUE son pays / son opérateur. L'équipe interne voit tout.
   ============================================================ */
'use strict';
const { q } = require('./bd');

// charge le rôle, les permissions et le périmètre d'un admin
async function chargerAcces(adminId) {
  const a = await q(
    `SELECT a.id, a.nom, a.courriel, a.suspendu, a.pays_iso, a.operateur_id,
            r.code AS role_code, r.libelle AS role_libelle, r.interne
       FROM administrateurs a
       LEFT JOIN bo_roles r ON r.id = a.role_id
      WHERE a.id = $1`, [adminId]);
  if (!a.rows.length) return null;
  const admin = a.rows[0];
  if (admin.suspendu) return { suspendu: true };

  const perms = await q(
    `SELECT p.code
       FROM bo_role_permissions rp
       JOIN bo_permissions p ON p.id = rp.permission_id
       JOIN administrateurs a ON a.role_id = rp.role_id
      WHERE a.id = $1`, [adminId]);

  return {
    id: admin.id, nom: admin.nom, courriel: admin.courriel,
    role: admin.role_code, roleLibelle: admin.role_libelle,
    interne: admin.interne !== false,      // true si équipe Ludikafrik
    permissions: perms.rows.map(r => r.code),
    perimetre: {
      paysIso: admin.pays_iso || null,      // null = tous les pays (interne)
      operateurId: admin.operateur_id || null
    }
  };
}

function aPermission(acces, code) {
  return !!(acces && acces.permissions && acces.permissions.indexOf(code) >= 0);
}

// middleware : exige une permission. À utiliser après `protege`.
// Suppose que req.admin.id est présent (jeton vérifié en amont).
function exige(code) {
  return async function (req, res, next) {
    try {
      const acces = await chargerAcces(req.admin.id);
      if (!acces) return res.status(401).json({ erreur: 'Compte introuvable.' });
      if (acces.suspendu) return res.status(403).json({ erreur: 'Compte suspendu.' });
      if (!aPermission(acces, code))
        return res.status(403).json({ erreur: 'Accès refusé (permission ' + code + ').' });
      req.acces = acces;      // dispo pour la suite (périmètre, filtrage)
      next();
    } catch (e) {
      console.error('exige', e); res.status(500).json({ erreur: 'Erreur serveur.' });
    }
  };
}

// filtre "périmètre" pour les requêtes SQL : renvoie un fragment WHERE + params.
// Pour un opérateur partenaire, restreint à son pays/opérateur.
// Pour l'équipe interne (perimetre vide), ne restreint rien.
//   colPays : nom de la colonne pays dans la requête (ex: 'pays_iso'), ou null
//   colOp   : nom de la colonne opérateur (ex: 'operateur_id'), ou null
function filtrePerimetre(acces, colPays, colOp, paramDepart) {
  var i = paramDepart || 1;
  var clauses = [];
  var params = [];
  if (acces && !acces.interne && acces.perimetre) {
    if (colPays && acces.perimetre.paysIso) {
      clauses.push(colPays + ' = $' + i); params.push(acces.perimetre.paysIso); i++;
    }
    if (colOp && acces.perimetre.operateurId) {
      clauses.push(colOp + ' = $' + i); params.push(acces.perimetre.operateurId); i++;
    }
  }
  return { where: clauses.length ? clauses.join(' AND ') : null, params: params, prochainParam: i };
}

// journal d'audit du back-office
async function auditer(req, action, ressource, details) {
  try {
    const ip = (req && (req.headers['x-forwarded-for'] || '').split(',')[0].trim())
            || (req && req.socket && req.socket.remoteAddress) || null;
    const nom = (req && req.admin && req.admin.nom) || (req && req.acces && req.acces.nom) || null;
    const adminId = (req && req.admin && req.admin.id) || null;
    await q(
      'INSERT INTO bo_audit(admin_id, admin_nom, action, ressource, details, ip) VALUES ($1,$2,$3,$4,$5,$6)',
      [adminId, nom, action, ressource || null, details ? JSON.stringify(details) : null, ip]);
  } catch (e) { console.error('[auditer]', e.message); }
}

module.exports = { chargerAcces, aPermission, exige, filtrePerimetre, auditer };
