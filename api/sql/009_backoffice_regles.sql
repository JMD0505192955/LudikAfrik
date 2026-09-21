-- ============================================================
--  009 — Back-office : Points, règles & progression.
--   - barème de points par action
--   - règles de conversion points -> pass / récompenses
--   - paramètres des classements
-- ============================================================

-- Barème : combien rapporte chaque action.
CREATE TABLE IF NOT EXISTS bo_bareme (
  id           BIGSERIAL PRIMARY KEY,
  action       TEXT UNIQUE NOT NULL,          -- partie_jouee | victoire | defi_gagne | parrainage | connexion_quotidienne
  libelle      TEXT NOT NULL,
  points       INTEGER NOT NULL DEFAULT 0,
  actif        BOOLEAN NOT NULL DEFAULT TRUE,
  maj_le       TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Règles de conversion : échanger des points contre une récompense.
CREATE TABLE IF NOT EXISTS bo_conversions (
  id           BIGSERIAL PRIMARY KEY,
  libelle      TEXT NOT NULL,                 -- "Pass Jour contre points"
  cout_points  INTEGER NOT NULL,              -- points nécessaires
  recompense_type TEXT NOT NULL,              -- pass | badge | credit
  recompense_valeur TEXT NOT NULL,            -- 'jour' | 'semaine' | nom du badge...
  actif        BOOLEAN NOT NULL DEFAULT TRUE,
  cree_le      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Paramètres des classements (périodicité, taille, remise à zéro).
CREATE TABLE IF NOT EXISTS bo_classements (
  id           BIGSERIAL PRIMARY KEY,
  code         TEXT UNIQUE NOT NULL,          -- hebdo | mensuel | global
  libelle      TEXT NOT NULL,
  periode      TEXT NOT NULL DEFAULT 'hebdo', -- jour | hebdo | mois | permanent
  taille       INTEGER NOT NULL DEFAULT 20,   -- nb de joueurs affichés
  actif        BOOLEAN NOT NULL DEFAULT TRUE,
  lots         JSONB                          -- ex: {"1":"1000 F airtime","2":"500 Mo","3":"250 Mo"}
);

-- ============================================================
--  Peuplement : le barème et les classements par défaut,
--  alignés sur ce que fait déjà le portail.
-- ============================================================
INSERT INTO bo_bareme(action, libelle, points) VALUES
  ('partie_jouee',          'Partie jouée',              5),
  ('victoire',              'Victoire',                  20),
  ('defi_gagne',            'Défi gagné',                40),
  ('parrainage',            'Parrainage d''un ami',      100),
  ('connexion_quotidienne', 'Connexion quotidienne',     10)
ON CONFLICT (action) DO NOTHING;

INSERT INTO bo_conversions(libelle, cout_points, recompense_type, recompense_valeur) VALUES
  ('Pass Jour contre points',    500,  'pass',  'jour'),
  ('Pass Semaine contre points', 1200, 'pass',  'semaine')
ON CONFLICT DO NOTHING;

INSERT INTO bo_classements(code, libelle, periode, taille, lots) VALUES
  ('hebdo',   'Classement de la semaine', 'hebdo', 20,
   '{"1":"1000 F airtime","2":"500 Mo","3":"250 Mo"}'::jsonb),
  ('mensuel', 'Classement du mois',       'mois',  50, '{}'::jsonb)
ON CONFLICT (code) DO NOTHING;
