-- ============================================================
--  008 — Back-office : catalogue de jeux, disponibilité par pays,
--        mise en avant, paramètres propres à chaque jeu.
-- ============================================================

-- Catalogue central des jeux.
CREATE TABLE IF NOT EXISTS bo_jeux (
  id           BIGSERIAL PRIMARY KEY,
  slug         TEXT UNIQUE NOT NULL,         -- akim, dozo, marche...
  nom          TEXT NOT NULL,
  categorie    TEXT NOT NULL DEFAULT 'Arcade',
  description  TEXT,
  fichier      TEXT,                         -- akim.html, dozo.html...
  actif        BOOLEAN NOT NULL DEFAULT TRUE,-- actif globalement
  en_avant     BOOLEAN NOT NULL DEFAULT FALSE, -- "à la une" sur l'accueil
  ordre        INTEGER NOT NULL DEFAULT 100, -- ordre d'affichage
  parametres   JSONB,                        -- réglages propres au jeu (difficulté, seuils...)
  cree_le      TIMESTAMPTZ NOT NULL DEFAULT now(),
  maj_le       TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_bojeux_actif ON bo_jeux(actif, ordre);

-- Disponibilité d'un jeu par pays (activation/désactivation ciblée).
-- Absence de ligne = disponible partout (comportement par défaut).
-- Présence d'une ligne avec disponible=false = masqué dans ce pays.
CREATE TABLE IF NOT EXISTS bo_jeux_pays (
  jeu_id      BIGINT NOT NULL REFERENCES bo_jeux(id) ON DELETE CASCADE,
  pays_iso    TEXT NOT NULL,
  disponible  BOOLEAN NOT NULL DEFAULT TRUE,
  PRIMARY KEY (jeu_id, pays_iso)
);

-- ============================================================
--  Peuplement : les jeux vedettes (le reste peut être importé
--  depuis le portail ou ajouté à la main).
-- ============================================================
INSERT INTO bo_jeux(slug, nom, categorie, fichier, actif, en_avant, ordre) VALUES
  ('marche',    'Le Marché',   'Stratégie', 'marche-faso.html',    TRUE, TRUE,  1),
  ('dozo',      'Dozo',        'Action',    'dozo.html',           TRUE, TRUE,  2),
  ('akim',      'Akim',        'Aventure',  'akim.html',           TRUE, TRUE,  3),
  ('anagramme', 'Anagrammes',  'Cerveau',   'anagramme-faso.html', TRUE, TRUE,  4),
  ('penalty',   'Penalty',     'Sport',     'penalty-faso.html',   TRUE, FALSE, 5),
  ('lutte',     'Lutte Ludik', 'Action',    'lutte-faso.html',     TRUE, FALSE, 6),
  ('tour-baobab','Tour du Baobab','Aventure','tour-baobab.html',   TRUE, FALSE, 7)
ON CONFLICT (slug) DO NOTHING;
