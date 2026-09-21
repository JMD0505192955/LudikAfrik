/* ============================================================
   API Ludikafrik — serveur Express.
   Monte les routes, applique les protections de base.
   ============================================================ */
'use strict';
const express = require('express');
const helmet = require('helmet');
const cors = require('cors');

const app = express();
app.set('trust proxy', 1);            // derrière nginx
app.use(helmet());
app.use(cors({ origin: process.env.CORS_ORIGINE || true, credentials: true }));
app.use(express.json({ limit: '256kb' }));

// petit log de requêtes
app.use((req, _res, next) => {
  if (process.env.LOG_REQUETES === 'true')
    console.log(new Date().toISOString(), req.method, req.url);
  next();
});

// santé — pour vérifier que l'API répond
app.get('/sante', (_req, res) => res.json({ ok: true, service: 'ludikafrik-api', heure: new Date().toISOString() }));

// routes métier
app.use('/', require('./routes/inscription'));
app.use('/', require('./routes/scores'));
app.use('/', require('./routes/abonnements'));
// back office (authentification existante)
app.use('/admin', require('./routes/admin-auth'));
app.use('/admin', require('./routes/admin-donnees'));
// back office avancé (RBAC scopé)
app.use('/bo', require('./routes/bo-acces'));
app.use('/bo', require('./routes/bo-pays'));
app.use('/bo', require('./routes/bo-joueurs'));
app.use('/bo', require('./routes/bo-jeux'));
app.use('/bo', require('./routes/bo-regles'));
app.use('/bo', require('./routes/bo-pass'));
app.use('/bo', require('./routes/bo-finances'));
app.use('/bo', require('./routes/bo-competitions'));
app.use('/bo', require('./routes/bo-notifications'));
// (à venir : back office étendu — jeux, compétitions)

// 404
app.use((_req, res) => res.status(404).json({ erreur: 'Route inconnue.' }));

// erreurs
app.use((err, _req, res, _next) => {
  console.error('[erreur]', err && err.message);
  res.status(500).json({ erreur: 'Erreur serveur.' });
});

const PORT = Number(process.env.PORT || 3000);
app.listen(PORT, () => console.log('API Ludikafrik à l\'écoute sur le port ' + PORT));

module.exports = app;
