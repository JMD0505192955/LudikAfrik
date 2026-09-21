-- ============================================================
--  004 — Pass et mots-clés opérateurs.
--  Le catalogue des pass est en base pour pouvoir l'ajuster par
--  pays/opérateur sans redéployer le code.
-- ============================================================

-- Catalogue des pass proposés, par opérateur.
CREATE TABLE IF NOT EXISTS pass_catalogue (
  id            BIGSERIAL PRIMARY KEY,
  operateur     TEXT    NOT NULL,               -- ex: moov-tg
  code          TEXT    NOT NULL,               -- jour | semaine | mois | competition
  libelle       TEXT    NOT NULL,               -- "Pass Jour"
  duree_jours   INTEGER NOT NULL,               -- 1, 7, 30 (0 pour compétition)
  prix          INTEGER NOT NULL,               -- en unités de la devise
  devise        TEXT    NOT NULL DEFAULT 'XOF',
  actif         BOOLEAN NOT NULL DEFAULT TRUE
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_pass_op_code ON pass_catalogue(operateur, code);

-- Mots-clés SMS/USSD : chacun porte service + forfait + mode.
CREATE TABLE IF NOT EXISTS mots_cles (
  id            BIGSERIAL PRIMARY KEY,
  operateur     TEXT    NOT NULL,
  motcle        TEXT    NOT NULL,               -- LUDIK1R, LUDIK7, …
  pass_code     TEXT    NOT NULL,               -- jour | semaine | mois
  renouvelable  BOOLEAN NOT NULL DEFAULT FALSE,
  actif         BOOLEAN NOT NULL DEFAULT TRUE
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_motcle ON mots_cles(operateur, motcle);

-- Peuplement initial pour Moov Togo (d'après le document Moov, 09/09/2026).
INSERT INTO pass_catalogue(operateur, code, libelle, duree_jours, prix, devise) VALUES
  ('moov-tg','jour',   'Pass Jour',    1,  100, 'XOF'),
  ('moov-tg','semaine','Pass Semaine', 7,  300, 'XOF'),
  ('moov-tg','mois',   'Pass Mois',    30, 1000,'XOF')
ON CONFLICT (operateur, code) DO NOTHING;

INSERT INTO mots_cles(operateur, motcle, pass_code, renouvelable) VALUES
  ('moov-tg','LUDIK1R', 'jour',    TRUE),
  ('moov-tg','LUDIK7R', 'semaine', TRUE),
  ('moov-tg','LUDIK30R','mois',    TRUE),
  ('moov-tg','LUDIK1',  'jour',    FALSE),
  ('moov-tg','LUDIK7',  'semaine', FALSE),
  ('moov-tg','LUDIK30', 'mois',    FALSE)
ON CONFLICT (operateur, motcle) DO NOTHING;
