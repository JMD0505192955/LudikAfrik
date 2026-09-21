-- ============================================================
--  012 — Back-office : Compétitions.
--   - création (classement / élimination / défi)
--   - fenêtre temporelle, jeux et pays éligibles
--   - récompenses, sponsoring opérateur soumis à validation
--   - participants + classement live + signalement de scores suspects
-- ============================================================

CREATE TABLE IF NOT EXISTS bo_competitions (
  id            BIGSERIAL PRIMARY KEY,
  titre         TEXT NOT NULL,
  type          TEXT NOT NULL DEFAULT 'classement', -- classement | elimination | defi
  jeux          TEXT,                          -- slugs séparés par virgule, ou NULL = tous
  pays_eligibles TEXT,                          -- ISO séparés par virgule, ou NULL = tous
  debut         TIMESTAMPTZ NOT NULL,
  fin           TIMESTAMPTZ NOT NULL,
  periodicite   TEXT NOT NULL DEFAULT 'ponctuelle', -- journaliere | hebdo | saisonniere | ponctuelle
  bareme        JSONB,                          -- barème spécifique (points par action)
  recompenses   JSONB,                          -- {"1":"1000 F","2":"badge Champion","3":"Pass Semaine"}
  -- sponsoring : une compétition proposée par un opérateur doit être validée
  sponsor_operateur_id BIGINT REFERENCES bo_operateurs(id) ON DELETE SET NULL,
  cree_par      BIGINT REFERENCES administrateurs(id) ON DELETE SET NULL,
  statut        TEXT NOT NULL DEFAULT 'brouillon', -- brouillon | en_attente_validation | publiee | terminee | refusee
  cree_le       TIMESTAMPTZ NOT NULL DEFAULT now(),
  maj_le        TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_bocomp_statut ON bo_competitions(statut, debut);

-- Participants et leur meilleur score dans la compétition.
CREATE TABLE IF NOT EXISTS bo_competition_participants (
  id            BIGSERIAL PRIMARY KEY,
  competition_id BIGINT NOT NULL REFERENCES bo_competitions(id) ON DELETE CASCADE,
  abonne_id     BIGINT NOT NULL REFERENCES abonnes(id) ON DELETE CASCADE,
  meilleur_score INTEGER NOT NULL DEFAULT 0,
  parties       INTEGER NOT NULL DEFAULT 0,
  suspect       BOOLEAN NOT NULL DEFAULT FALSE, -- score/pattern signalé
  motif_suspect TEXT,
  maj_le        TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (competition_id, abonne_id)
);
CREATE INDEX IF NOT EXISTS idx_bocompart ON bo_competition_participants(competition_id, meilleur_score DESC);
