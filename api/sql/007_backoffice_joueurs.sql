-- ============================================================
--  007 — Back-office : modération des joueurs & réclamations.
--  S'appuie sur la table "abonnes" existante (statut déjà présent).
-- ============================================================

-- Historique de modération (qui a suspendu/banni/réinitialisé, pourquoi).
CREATE TABLE IF NOT EXISTS bo_moderation (
  id           BIGSERIAL PRIMARY KEY,
  abonne_id    BIGINT NOT NULL REFERENCES abonnes(id) ON DELETE CASCADE,
  admin_id     BIGINT REFERENCES administrateurs(id) ON DELETE SET NULL,
  admin_nom    TEXT,
  action       TEXT NOT NULL,               -- suspension | bannissement | reactivation | reinitialisation
  motif        TEXT,
  cree_le      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_bomod_abonne ON bo_moderation(abonne_id, cree_le);

-- Réclamations / tickets liés à un compte joueur.
CREATE TABLE IF NOT EXISTS bo_reclamations (
  id           BIGSERIAL PRIMARY KEY,
  abonne_id    BIGINT REFERENCES abonnes(id) ON DELETE SET NULL,
  telephone    TEXT,                          -- copie, au cas où le compte est supprimé
  sujet        TEXT NOT NULL,
  message      TEXT,
  categorie    TEXT NOT NULL DEFAULT 'general', -- paiement | compte | jeu | general
  statut       TEXT NOT NULL DEFAULT 'ouvert', -- ouvert | en_cours | resolu | ferme
  pays_iso     TEXT,                          -- pour le périmètre opérateur
  operateur_id BIGINT,                        -- pour le périmètre opérateur
  assigne_a    BIGINT REFERENCES administrateurs(id) ON DELETE SET NULL,
  cree_le      TIMESTAMPTZ NOT NULL DEFAULT now(),
  maj_le       TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_boreclam_statut ON bo_reclamations(statut, cree_le);
CREATE INDEX IF NOT EXISTS idx_boreclam_abonne ON bo_reclamations(abonne_id);

-- statut "banni" en plus des statuts existants sur abonnes : géré applicativement
-- (essai | actif | suspendu | resilie | banni). Pas de contrainte CHECK ici
-- pour ne pas casser les lignes existantes.
