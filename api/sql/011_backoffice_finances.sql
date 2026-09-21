-- ============================================================
--  011 — Back-office : Finances & paiements.
--   - suivi des transactions (s'appuie sur "prelevements")
--   - réconciliation par opérateur/pays/période
--   - statuts + remboursements
-- ============================================================

-- Enrichir les prélèvements pour le suivi financier scopé.
ALTER TABLE prelevements ADD COLUMN IF NOT EXISTS pays_iso      TEXT;
ALTER TABLE prelevements ADD COLUMN IF NOT EXISTS operateur_id  BIGINT;
ALTER TABLE prelevements ADD COLUMN IF NOT EXISTS moyen         TEXT;   -- orange, mtn, wave, moov, airtime
ALTER TABLE prelevements ADD COLUMN IF NOT EXISTS reverse       BOOLEAN NOT NULL DEFAULT FALSE; -- déjà reversé par l'opérateur ?
ALTER TABLE prelevements ADD COLUMN IF NOT EXISTS rembourse     BOOLEAN NOT NULL DEFAULT FALSE;

-- statut peut valoir : en_attente | reussi | echec | rembourse
CREATE INDEX IF NOT EXISTS idx_prel_pays ON prelevements(pays_iso, cree_le);
CREATE INDEX IF NOT EXISTS idx_prel_op   ON prelevements(operateur_id, cree_le);
CREATE INDEX IF NOT EXISTS idx_prel_stat ON prelevements(statut, cree_le);

-- Relevés de réconciliation : un enregistrement par période/opérateur.
-- Compare ce qui a été COLLECTÉ vs ce que l'opérateur doit REVERSER
-- (selon son taux de reversement défini dans bo_operateurs).
CREATE TABLE IF NOT EXISTS bo_reconciliation (
  id              BIGSERIAL PRIMARY KEY,
  operateur_id    BIGINT NOT NULL REFERENCES bo_operateurs(id) ON DELETE CASCADE,
  pays_iso        TEXT NOT NULL,
  periode_debut   DATE NOT NULL,
  periode_fin     DATE NOT NULL,
  total_collecte  INTEGER NOT NULL DEFAULT 0,   -- somme des prélèvements réussis
  taux_reversement NUMERIC(5,2),                -- copie du taux au moment du relevé
  du_a_reverser   INTEGER NOT NULL DEFAULT 0,   -- collecté * taux
  montant_recu    INTEGER NOT NULL DEFAULT 0,   -- ce que l'opérateur a effectivement reversé
  ecart           INTEGER NOT NULL DEFAULT 0,   -- du_a_reverser - montant_recu
  statut          TEXT NOT NULL DEFAULT 'ouvert', -- ouvert | valide | conteste
  note            TEXT,
  cree_le         TIMESTAMPTZ NOT NULL DEFAULT now(),
  maj_le          TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_boreconc ON bo_reconciliation(operateur_id, periode_debut);
