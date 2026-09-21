/* Applique toutes les migrations SQL de api/sql dans l'ordre. */
'use strict';
const fs = require('fs');
const path = require('path');
const { pool } = require('../src/lib/bd');

(async () => {
  const dossier = path.join(__dirname, '..', 'sql');
  const fichiers = fs.readdirSync(dossier).filter(f => f.endsWith('.sql')).sort();
  for (const f of fichiers) {
    const sql = fs.readFileSync(path.join(dossier, f), 'utf8');
    process.stdout.write('  ' + f + ' … ');
    try { await pool.query(sql); console.log('ok'); }
    catch (e) { console.log('ÉCHEC'); console.error(e.message); process.exit(1); }
  }
  console.log('Migrations terminées.');
  await pool.end();
})();
