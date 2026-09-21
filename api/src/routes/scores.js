/* ============================================================
   Scores & classement.
   Le portail envoie un score en fin de partie ; on l'enregistre
   et on alimente le classement hebdomadaire.

   Monté dans serveur.js :  app.use('/', require('./routes/scores'));

     POST /scores            { telephone, jeu, score, victoire }
     GET  /classement         → top de la semaine, tous jeux confondus
     GET  /classement/:jeu    → top de la semaine pour un jeu
   ============================================================ */
'use strict';
const express = require('express');
const limite = require('express-rate-limit');
const { q } = require('../lib/bd');

const r = express.Router();
r.use(express.json());

/* numéro de semaine ISO, format 'AAAA-WW' */
function semaineCourante(d = new Date()) {
  const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const jour = (t.getUTCDay() + 6) % 7;
  t.setUTCDate(t.getUTCDate() - jour + 3);
  const premier = new Date(Date.UTC(t.getUTCFullYear(), 0, 4));
  const sem = 1 + Math.round(((t - premier) / 86400000 - 3 + ((premier.getUTCDay() + 6) % 7)) / 7);
  return t.getUTCFullYear() + '-' + String(sem).padStart(2, '0');
}

function normaliser(brut) {
  if (!brut) return null;
  let n = String(brut).trim().replace(/[\s\-().]/g, '');
  if (n.startsWith('00')) n = '+' + n.slice(2);
  if (!n.startsWith('+')) n = '+226' + n.replace(/^0+/, '');
  return /^\+\d{8,15}$/.test(n) ? n : null;
}

const brute = limite({ windowMs: 60 * 1000, max: 60,
  message: { erreur: 'Trop de scores envoyés, ralentis un peu.' } });

/* Enregistrer un score. Le score est plafonné pour éviter les valeurs aberrantes. */
r.post('/scores', brute, async (req, res) => {
  try {
    const { telephone, jeu, score, victoire } = req.body || {};
    const tel = normaliser(telephone);
    if (!tel) return res.status(400).json({ erreur: 'Numéro invalide.' });
    if (!jeu || typeof jeu !== 'string' || jeu.length > 40)
      return res.status(400).json({ erreur: 'Jeu invalide.' });
    const s = Math.max(0, Math.min(100000, parseInt(score, 10) || 0));

    const ab = await q('SELECT id FROM abonnes WHERE telephone=$1', [tel]);
    if (!ab.rows.length) return res.status(404).json({ erreur: 'Abonné inconnu.' });

    await q(
      'INSERT INTO scores(abonne_id, jeu, score, victoire, semaine) VALUES ($1,$2,$3,$4,$5)',
      [ab.rows[0].id, jeu.trim(), s, !!victoire, semaineCourante()]
    );
    res.json({ ok: true });
  } catch (e) { console.error('scores', e); res.status(500).json({ erreur: 'Erreur serveur.' }); }
});

/* Classement de la semaine — meilleur score par abonné. */
async function classement(jeu) {
  const sem = semaineCourante();
  const params = [sem];
  let filtreJeu = '';
  if (jeu) { params.push(jeu); filtreJeu = 'AND s.jeu = $2'; }
  const { rows } = await q(
    `SELECT a.pseudo, MAX(s.score) AS meilleur
       FROM scores s JOIN abonnes a ON a.id = s.abonne_id
      WHERE s.semaine = $1 ${filtreJeu} AND a.pseudo IS NOT NULL
      GROUP BY a.pseudo
      ORDER BY meilleur DESC
      LIMIT 20`, params);
  return rows;
}

r.get('/classement', async (req, res) => {
  try { res.json({ ok: true, semaine: semaineCourante(), rangs: await classement(null) }); }
  catch (e) { console.error('classement', e); res.status(500).json({ erreur: 'Erreur serveur.' }); }
});

r.get('/classement/:jeu', async (req, res) => {
  try { res.json({ ok: true, jeu: req.params.jeu, rangs: await classement(req.params.jeu) }); }
  catch (e) { console.error('classement jeu', e); res.status(500).json({ erreur: 'Erreur serveur.' }); }
});

module.exports = r;
