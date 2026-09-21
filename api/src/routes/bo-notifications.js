/* ============================================================
   Back-office — Module 9 : Notifications.
   Monté : app.use('/bo', require('./routes/bo-notifications'));

     GET   /bo/notifications           liste
     POST  /bo/notifications           créer (brouillon/programmée/immédiate)
     PATCH /bo/notifications/:id        modifier
     POST  /bo/notifications/:id/envoyer  envoyer maintenant
     DELETE /bo/notifications/:id       supprimer/annuler
   ============================================================ */
'use strict';
const express = require('express');
const { q } = require('../lib/bd');
const { protege } = require('../lib/auth');
const { exige, auditer } = require('../lib/bo-acces');

const r = express.Router();
r.use(express.json());
r.use(protege);

// types de cibles autorisés (lien profond vers l'app)
const CIBLES = ['classement', 'joueur', 'competition', 'jeu', 'pass', 'accueil', 'url'];

// --- liste ---
r.get('/notifications', exige('notifs.lire'), async (req, res) => {
  try {
    const clauses = [], params = []; let i = 1;
    if (req.query.statut) { clauses.push('statut=$' + i); params.push(req.query.statut); i++; }
    let sql = `SELECT id, titre, message, icone, cible_type, cible_ref, audience, pays_iso,
                      statut, envoi_prevu, envoye_le, cree_le FROM bo_notifications`;
    if (clauses.length) sql += ' WHERE ' + clauses.join(' AND ');
    sql += ' ORDER BY cree_le DESC LIMIT 100';
    const { rows } = await q(sql, params);
    res.json({ ok: true, notifications: rows });
  } catch (e) { console.error(e); res.status(500).json({ erreur: 'Erreur serveur.' }); }
});

// --- créer ---
r.post('/notifications', exige('notifs.ecrire'), async (req, res) => {
  try {
    const { titre, message, icone, cible_type, cible_ref, audience, pays_iso, envoi_prevu } = req.body || {};
    if (!titre || !message) return res.status(400).json({ erreur: 'Titre et message requis.' });
    if (cible_type && CIBLES.indexOf(cible_type) < 0)
      return res.status(400).json({ erreur: 'Type de cible invalide.' });
    // une cible autre que accueil/url exige une référence
    if (cible_type && cible_type !== 'accueil' && !cible_ref)
      return res.status(400).json({ erreur: 'Cette cible nécessite une référence (id ou slug).' });

    const statut = envoi_prevu ? 'programmee' : 'brouillon';
    const ins = await q(
      `INSERT INTO bo_notifications(titre, message, icone, cible_type, cible_ref, audience, pays_iso, statut, envoi_prevu, cree_par)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING id`,
      [titre, message, icone || '🔔', cible_type || 'accueil', cible_ref || null,
       audience || 'tous', pays_iso || null, statut, envoi_prevu || null, req.admin && req.admin.id]);
    await auditer(req, 'notification.creee', 'notif#' + ins.rows[0].id, { titre, cible_type });
    res.json({ ok: true, id: ins.rows[0].id, statut });
  } catch (e) { console.error(e); res.status(500).json({ erreur: 'Erreur serveur.' }); }
});

// --- modifier ---
r.patch('/notifications/:id', exige('notifs.ecrire'), async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const permis = ['titre', 'message', 'icone', 'cible_type', 'cible_ref', 'audience', 'pays_iso', 'envoi_prevu', 'statut'];
    const champs = [], params = []; let i = 1;
    permis.forEach(k => { if (req.body[k] !== undefined) { champs.push(k + '=$' + i); params.push(req.body[k]); i++; } });
    if (!champs.length) return res.status(400).json({ erreur: 'Rien à modifier.' });
    params.push(id);
    await q('UPDATE bo_notifications SET ' + champs.join(', ') + ' WHERE id=$' + i, params);
    await auditer(req, 'notification.modifiee', 'notif#' + id, req.body);
    res.json({ ok: true });
  } catch (e) { console.error(e); res.status(500).json({ erreur: 'Erreur serveur.' }); }
});

// --- envoyer maintenant ---
r.post('/notifications/:id/envoyer', exige('notifs.ecrire'), async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    // en production : dispatch réel (push/in-app) selon l'audience. Ici : marquer envoyée.
    await q("UPDATE bo_notifications SET statut='envoyee', envoye_le=now() WHERE id=$1", [id]);
    await auditer(req, 'notification.envoyee', 'notif#' + id);
    res.json({ ok: true });
  } catch (e) { console.error(e); res.status(500).json({ erreur: 'Erreur serveur.' }); }
});

// --- supprimer / annuler ---
r.delete('/notifications/:id', exige('notifs.ecrire'), async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    await q('DELETE FROM bo_notifications WHERE id=$1', [id]);
    await auditer(req, 'notification.supprimee', 'notif#' + id);
    res.json({ ok: true });
  } catch (e) { console.error(e); res.status(500).json({ erreur: 'Erreur serveur.' }); }
});

module.exports = r;
