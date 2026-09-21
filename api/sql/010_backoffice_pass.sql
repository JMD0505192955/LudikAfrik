-- ============================================================
--  010 — Back-office : Pass & monétisation.
--   - catalogue des types de pass par pays/opérateur
--   - promotions et codes promo
--   (l'historique des ventes s'appuie sur la table "abonnements"
--    existante ; on l'enrichit pour la traçabilité back-office)
-- ============================================================

-- Types de pass proposés (le catalogue "pass_catalogue" de 004 était
-- lié à Moov ; on centralise ici un catalogue administrable par pays).
CREATE TABLE IF NOT EXISTS bo_pass_types (
  id           BIGSERIAL PRIMARY KEY,
  pays_iso     TEXT NOT NULL,
  code         TEXT NOT NULL,                 -- jour | semaine | mois | competition
  libelle      TEXT NOT NULL,
  duree_jours  INTEGER NOT NULL,
  prix         INTEGER NOT NULL,
  devise       TEXT NOT NULL DEFAULT 'XOF',
  jeux_inclus  TEXT NOT NULL DEFAULT 'tous',  -- 'tous' ou liste de slugs séparés par virgule
  actif        BOOLEAN NOT NULL DEFAULT TRUE,
  cree_le      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_bopass_pays_code ON bo_pass_types(pays_iso, code);

-- Promotions / codes promo.
CREATE TABLE IF NOT EXISTS bo_promos (
  id           BIGSERIAL PRIMARY KEY,
  code         TEXT UNIQUE NOT NULL,          -- LUDIK10, BIENVENUE...
  libelle      TEXT NOT NULL,
  type         TEXT NOT NULL DEFAULT 'reduction', -- reduction | pass_offert
  valeur       INTEGER NOT NULL,              -- % de réduction OU jours de pass offert
  pays_iso     TEXT,                          -- NULL = tous les pays
  debut        TIMESTAMPTZ,
  fin          TIMESTAMPTZ,
  max_usages   INTEGER,                       -- NULL = illimité
  usages       INTEGER NOT NULL DEFAULT 0,
  actif        BOOLEAN NOT NULL DEFAULT TRUE,
  cree_le      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_bopromo_actif ON bo_promos(actif, fin);

-- Enrichir "abonnements" pour la traçabilité (pays/opérateur au moment de l'achat).
ALTER TABLE abonnements ADD COLUMN IF NOT EXISTS pays_iso     TEXT;
ALTER TABLE abonnements ADD COLUMN IF NOT EXISTS operateur_id BIGINT;
ALTER TABLE abonnements ADD COLUMN IF NOT EXISTS promo_code   TEXT;

-- ============================================================
--  Peuplement : les pass par pays actif (CI et TG), 100/300/1000.
-- ============================================================
INSERT INTO bo_pass_types(pays_iso, code, libelle, duree_jours, prix) VALUES
  ('CI','jour','Pass Jour',1,100),('CI','semaine','Pass Semaine',7,300),('CI','mois','Pass Mois',30,1000),
  ('TG','jour','Pass Jour',1,100),('TG','semaine','Pass Semaine',7,300),('TG','mois','Pass Mois',30,1000)
ON CONFLICT (pays_iso, code) DO NOTHING;
