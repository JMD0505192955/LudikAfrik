-- ============================================================
--  Ludikafrik — schéma de base (001)
--  PostgreSQL 16. Conventions identiques à AfriKfables.
-- ============================================================

-- Administrateurs du back office.
CREATE TABLE IF NOT EXISTS administrateurs (
  id          BIGSERIAL PRIMARY KEY,
  nom         TEXT NOT NULL,
  courriel    TEXT UNIQUE NOT NULL,
  motdepasse  TEXT NOT NULL,                  -- bcrypt
  role        TEXT NOT NULL DEFAULT 'editeur',-- editeur | admin
  actif       BOOLEAN NOT NULL DEFAULT TRUE,
  cree_le     TIMESTAMPTZ NOT NULL DEFAULT now(),
  vu_le       TIMESTAMPTZ
);

-- Abonnés (joueurs).
CREATE TABLE IF NOT EXISTS abonnes (
  id          BIGSERIAL PRIMARY KEY,
  telephone   TEXT UNIQUE NOT NULL,           -- format international +226…
  pays        TEXT NOT NULL,
  operateur   TEXT,
  pseudo      TEXT,
  statut      TEXT NOT NULL DEFAULT 'essai',  -- essai | actif | suspendu | resilie
  cree_le     TIMESTAMPTZ NOT NULL DEFAULT now(),
  vu_le       TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_abonnes_tel ON abonnes(telephone);

-- Abonnements (pass jour/semaine/mois).
CREATE TABLE IF NOT EXISTS abonnements (
  id            BIGSERIAL PRIMARY KEY,
  abonne_id     BIGINT NOT NULL REFERENCES abonnes(id) ON DELETE CASCADE,
  pass          TEXT NOT NULL,                -- jour | semaine | mois
  prix          INTEGER NOT NULL,
  devise        TEXT NOT NULL DEFAULT 'XOF',
  debut         TIMESTAMPTZ NOT NULL DEFAULT now(),
  fin           TIMESTAMPTZ NOT NULL,
  reconduction  BOOLEAN NOT NULL DEFAULT TRUE,
  statut        TEXT NOT NULL DEFAULT 'actif',-- actif | expire | annule | echec
  cree_le       TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_abo_actif ON abonnements(abonne_id, statut, fin);

-- Prélèvements (traçabilité facturation opérateur).
CREATE TABLE IF NOT EXISTS prelevements (
  id          BIGSERIAL PRIMARY KEY,
  abonne_id   BIGINT REFERENCES abonnes(id) ON DELETE SET NULL,
  montant     INTEGER NOT NULL,
  devise      TEXT NOT NULL DEFAULT 'XOF',
  operateur   TEXT,
  reference   TEXT,
  message     TEXT,
  statut      TEXT NOT NULL DEFAULT 'en_attente', -- en_attente | reussi | echec
  cree_le     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_prel_ref ON prelevements(operateur, reference);

-- Scores des parties (un enregistrement par partie jouée).
CREATE TABLE IF NOT EXISTS scores (
  id          BIGSERIAL PRIMARY KEY,
  abonne_id   BIGINT REFERENCES abonnes(id) ON DELETE CASCADE,
  jeu         TEXT NOT NULL,                  -- identifiant du jeu
  score       INTEGER NOT NULL DEFAULT 0,
  victoire    BOOLEAN NOT NULL DEFAULT FALSE,
  semaine     TEXT NOT NULL,                  -- 'AAAA-WW' pour le classement hebdo
  cree_le     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_scores_sem ON scores(semaine, jeu, score);
CREATE INDEX IF NOT EXISTS idx_scores_ab  ON scores(abonne_id);

-- Journal d'audit.
CREATE TABLE IF NOT EXISTS journal (
  id          BIGSERIAL PRIMARY KEY,
  action      TEXT NOT NULL,
  cible       TEXT,
  details     JSONB,
  ip          TEXT,
  cree_le     TIMESTAMPTZ NOT NULL DEFAULT now()
);
