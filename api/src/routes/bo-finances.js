/* ============================================================
   Back-office — Module 7 : Finances & paiements.
   Monté : app.use('/bo', require('./routes/bo-finances'));

     GET  /bo/finances/resume?pays=&operateur=&debut=&fin=
                                        chiffres clés (collecté, à reverser…)
     GET  /bo/finances/transactions?statut=&pays=&page=
                                        liste des transactions (scopée)
     PATCH /bo/finances/transactions/:id  changer statut / rembourser
     GET  /bo/finances/reconciliation   relevés de réconciliation
     POST /bo/finances/reconciliation   générer un relevé pour une période
     GET  /bo/finances/export?...       export CSV comptable

   Périmètre : un opérateur ne voit QUE ses transactions/pays.
   ============================================================ */
'use strict';
const express = require('express');
const { q } = require('../lib/bd');
const { protege } = require('../lib/auth');
const { exige, auditer, filtrePerimetre } = require('../lib/bo-acces');

const r = express.Router();
r.use(express.json());
r.use(protege);

function masquer(t) { return t ? (t.slice(0, 6) + ' ** ** ' + t.slice(-2)) : '—'; }

// --- résumé financier (chiffres clés) ---
r.get('/finances/resume', exige('finances.lire'), async (req, res) => {
  try {
    const clauses = ["statut='reussi'"], params = []; let i = 1;
    if (req.query.debut) { clauses.push('cree_le >= $' + i); params.push(req.query.debut); i++; }
    if (req.query.fin)   { clauses.push('cree_le <= $' + i); params.push(req.query.fin); i++; }
    if (req.query.pays)  { clauses.push('pays_iso = $' + i); params.push(req.query.pays.toUpperCase()); i++; }
    const f = filtrePerimetre(req.acces, 'pays_iso', 'operateur_id', i);
    if (f.where) { clauses.push(f.where); f.params.forEach(p => params.push(p)); i = f.prochainParam; }
    const where = 'WHERE ' + clauses.join(' AND ');

    const [collecte, parStatut, reverse] = await Promise.all([
      q('SELECT coalesce(sum(montant),0)::int AS total, count(*)::int AS nb FROM prelevements ' + where, params),
      q("SELECT statut, count(*)::int AS nb, coalesce(sum(montant),0)::int AS montant FROM prelevements " +
        (clauses.length > 1 ? 'WHERE ' + clauses.slice(1).join(' AND ') : '') + ' GROUP BY statut', params.slice(0)),
      q('SELECT coalesce(sum(montant) FILTER (WHERE reverse),0)::int AS reverse FROM prelevements ' + where, params)
    ]);
    res.json({ ok: true,
      total_collecte: collecte.rows[0].total,
      nb_transactions: collecte.rows[0].nb,
      deja_reverse: reverse.rows[0].reverse,
      par_statut: parStatut.rows });
  } catch (e) { console.error(e); res.status(500).json({ erreur: 'Erreur serveur.' }); }
});

// --- liste des transactions (scopée) ---
r.get('/finances/transactions', exige('finances.lire'), async (req, res) => {
  try {
    const page = Math.max(0, parseInt(req.query.page, 10) || 0);
    const PAGE = 40;
    const clauses = [], params = []; let i = 1;
    if (req.query.statut) { clauses.push('p.statut=$' + i); params.push(req.query.statut); i++; }
    if (req.query.pays)   { clauses.push('p.pays_iso=$' + i); params.push(req.query.pays.toUpperCase()); i++; }
    const f = filtrePerimetre(req.acces, 'p.pays_iso', 'p.operateur_id', i);
    if (f.where) { clauses.push(f.where); f.params.forEach(x => params.push(x)); i = f.prochainParam; }
    let sql =
      `SELECT p.id, p.montant, p.devise, p.operateur, p.moyen, p.reference, p.statut,
              p.reverse, p.rembourse, p.pays_iso, p.cree_le, a.pseudo, a.telephone
         FROM prelevements p LEFT JOIN abonnes a ON a.id=p.abonne_id`;
    if (clauses.length) sql += ' WHERE ' + clauses.join(' AND ');
    sql += ' ORDER BY p.cree_le DESC LIMIT ' + PAGE + ' OFFSET ' + (page * PAGE);
    const { rows } = await q(sql, params);
    rows.forEach(t => { t.telephone = masquer(t.telephone); });
    res.json({ ok: true, page, transactions: rows });
  } catch (e) { console.error(e); res.status(500).json({ erreur: 'Erreur serveur.' }); }
});

// --- changer le statut d'une transaction / rembourser ---
r.patch('/finances/transactions/:id', exige('finances.ecrire'), async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const { statut, reverse, rembourse } = req.body || {};
    const champs = [], params = []; let i = 1;
    if (statut !== undefined)    { champs.push('statut=$' + i); params.push(statut); i++; }
    if (reverse !== undefined)   { champs.push('reverse=$' + i); params.push(!!reverse); i++; }
    if (rembourse !== undefined) { champs.push('rembourse=$' + i, "statut='rembourse'"); params.push(!!rembourse); i++; }
    if (!champs.length) return res.status(400).json({ erreur: 'Rien à modifier.' });
    params.push(id);
    await q('UPDATE prelevements SET ' + champs.join(', ') + ' WHERE id=$' + i, params);
    await auditer(req, 'transaction.modifiee', 'transaction#' + id, req.body);
    res.json({ ok: true });
  } catch (e) { console.error(e); res.status(500).json({ erreur: 'Erreur serveur.' }); }
});

// --- relevés de réconciliation existants ---
r.get('/finances/reconciliation', exige('finances.lire'), async (req, res) => {
  try {
    const clauses = [], params = []; let i = 1;
    const f = filtrePerimetre(req.acces, 'pays_iso', 'operateur_id', i);
    if (f.where) { clauses.push(f.where); f.params.forEach(x => params.push(x)); i = f.prochainParam; }
    let sql = 'SELECT * FROM bo_reconciliation';
    if (clauses.length) sql += ' WHERE ' + clauses.join(' AND ');
    sql += ' ORDER BY periode_debut DESC LIMIT 50';
    const { rows } = await q(sql, params);
    res.json({ ok: true, releves: rows });
  } catch (e) { console.error(e); res.status(500).json({ erreur: 'Erreur serveur.' }); }
});

// --- générer un relevé de réconciliation pour une période/opérateur ---
r.post('/finances/reconciliation', exige('finances.ecrire'), async (req, res) => {
  try {
    const { operateur_id, debut, fin } = req.body || {};
    if (!operateur_id || !debut || !fin) return res.status(400).json({ erreur: 'Opérateur et période requis.' });

    // récupérer l'opérateur + son taux + son pays
    const op = await q(
      `SELECT o.id, o.taux_reversement, p.iso AS pays_iso
         FROM bo_operateurs o JOIN bo_pays p ON p.id=o.pays_id WHERE o.id=$1`, [operateur_id]);
    if (!op.rows.length) return res.status(400).json({ erreur: 'Opérateur inconnu.' });
    const taux = op.rows[0].taux_reversement || 0;
    const paysIso = op.rows[0].pays_iso;

    // total collecté sur la période (prélèvements réussis de cet opérateur)
    const col = await q(
      `SELECT coalesce(sum(montant),0)::int AS total FROM prelevements
        WHERE operateur_id=$1 AND statut='reussi' AND cree_le >= $2 AND cree_le <= $3`,
      [operateur_id, debut, fin]);
    const collecte = col.rows[0].total;
    const duReverser = Math.round(collecte * taux / 100);

    const ins = await q(
      `INSERT INTO bo_reconciliation(operateur_id, pays_iso, periode_debut, periode_fin,
        total_collecte, taux_reversement, du_a_reverser, ecart)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$7) RETURNING id`,
      [operateur_id, paysIso, debut, fin, collecte, taux, duReverser]);
    await auditer(req, 'reconciliation.generee', 'reconc#' + ins.rows[0].id, { operateur_id, debut, fin, collecte });
    res.json({ ok: true, id: ins.rows[0].id, total_collecte: collecte, du_a_reverser: duReverser, taux: taux });
  } catch (e) { console.error(e); res.status(500).json({ erreur: 'Erreur serveur.' }); }
});

// --- export CSV comptable ---
r.get('/finances/export', exige('finances.lire'), async (req, res) => {
  try {
    const clauses = ["p.statut='reussi'"], params = []; let i = 1;
    if (req.query.debut) { clauses.push('p.cree_le >= $' + i); params.push(req.query.debut); i++; }
    if (req.query.fin)   { clauses.push('p.cree_le <= $' + i); params.push(req.query.fin); i++; }
    if (req.query.pays)  { clauses.push('p.pays_iso = $' + i); params.push(req.query.pays.toUpperCase()); i++; }
    const f = filtrePerimetre(req.acces, 'p.pays_iso', 'p.operateur_id', i);
    if (f.where) { clauses.push(f.where); f.params.forEach(x => params.push(x)); i = f.prochainParam; }
    const { rows } = await q(
      `SELECT p.id, p.cree_le, p.pays_iso, p.operateur, p.moyen, p.montant, p.devise, p.reference, p.statut
         FROM prelevements p WHERE ` + clauses.join(' AND ') + ' ORDER BY p.cree_le', params);
    // CSV simple (séparateur ;)
    let csv = 'id;date;pays;operateur;moyen;montant;devise;reference;statut\n';
    rows.forEach(t => {
      csv += [t.id, new Date(t.cree_le).toISOString(), t.pays_iso || '', t.operateur || '',
              t.moyen || '', t.montant, t.devise, t.reference || '', t.statut].join(';') + '\n';
    });
    await auditer(req, 'finances.export', 'export', { nb: rows.length });
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="ludikafrik-finances.csv"');
    res.send(csv);
  } catch (e) { console.error(e); res.status(500).json({ erreur: 'Erreur serveur.' }); }
});

module.exports = r;
