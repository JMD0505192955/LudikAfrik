/* ============================================================
   Accès à PostgreSQL — un pool partagé, deux aides : q et transaction.
   Toutes les requêtes de l'application passent par ici.
   ============================================================ */
'use strict';
const { Pool } = require('pg');

const pool = new Pool({
  host:     process.env.PGHOST     || 'base',
  port:     Number(process.env.PGPORT || 5432),
  user:     process.env.PGUSER     || 'ludik',
  password: process.env.PGPASSWORD || 'ludik',
  database: process.env.PGDATABASE || 'ludikafrik',
  max: 10,
  idleTimeoutMillis: 30000,
});

pool.on('error', (e) => console.error('[bd] erreur pool', e.message));

/* Requête simple : q('SELECT …', [params]) → { rows } */
async function q(texte, params) {
  return pool.query(texte, params);
}

/* Transaction : transaction(async (client) => { … }) */
async function transaction(travail) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const r = await travail(client);
    await client.query('COMMIT');
    return r;
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}

module.exports = { pool, q, transaction };
