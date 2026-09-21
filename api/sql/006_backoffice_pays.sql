-- ============================================================
--  006 — Back-office : Pays, Opérateurs, Moyens de paiement.
--
--  Fondation multi-pays administrable depuis le back-office
--  (plutôt qu'en dur dans le code). Le portail et l'API liront
--  ces tables ; le référentiel JS reste le repli hors-ligne.
-- ============================================================

-- Pays gérés par la plateforme.
CREATE TABLE IF NOT EXISTS bo_pays (
  id            BIGSERIAL PRIMARY KEY,
  iso           TEXT UNIQUE NOT NULL,        -- CI, TG, BF...
  nom           TEXT NOT NULL,
  indicatif     TEXT NOT NULL,               -- +225
  devise        TEXT NOT NULL DEFAULT 'XOF',
  langue        TEXT NOT NULL DEFAULT 'fr',
  longueur_num  INTEGER,                     -- longueur nationale attendue
  actif         BOOLEAN NOT NULL DEFAULT FALSE,
  reglementation JSONB,                      -- notes de conformité locale, seuils KYC...
  cree_le       TIMESTAMPTZ NOT NULL DEFAULT now(),
  maj_le        TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_bopays_actif ON bo_pays(actif);

-- Opérateurs, rattachés à un pays.
CREATE TABLE IF NOT EXISTS bo_operateurs (
  id             BIGSERIAL PRIMARY KEY,
  pays_id        BIGINT NOT NULL REFERENCES bo_pays(id) ON DELETE CASCADE,
  code           TEXT NOT NULL,              -- moov-tg, orange-ci, agregateur-ci
  nom            TEXT NOT NULL,
  type           TEXT NOT NULL DEFAULT 'airtime', -- airtime | mobilemoney
  taux_reversement NUMERIC(5,2),             -- % que l'opérateur reverse (ex: 70.00)
  actif          BOOLEAN NOT NULL DEFAULT FALSE,  -- true = contrat signé, facturation active
  -- identifiants API chiffrés/masqués (jamais renvoyés en clair côté client)
  api_config     JSONB,                      -- { base_url, cle_masquee, short_code, ussd... }
  cree_le        TIMESTAMPTZ NOT NULL DEFAULT now(),
  maj_le         TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_booperateur_code ON bo_operateurs(pays_id, code);

-- Moyens de paiement (pour les opérateurs de type mobilemoney/agrégateur).
CREATE TABLE IF NOT EXISTS bo_moyens_paiement (
  id            BIGSERIAL PRIMARY KEY,
  operateur_id  BIGINT NOT NULL REFERENCES bo_operateurs(id) ON DELETE CASCADE,
  code          TEXT NOT NULL,               -- orange, mtn, moov, wave
  nom           TEXT NOT NULL,               -- Orange Money, MTN MoMo...
  couleur       TEXT,                        -- pour l'affichage
  actif         BOOLEAN NOT NULL DEFAULT TRUE
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_bomoyen ON bo_moyens_paiement(operateur_id, code);

-- Le périmètre opérateur des comptes admin pointe vers bo_operateurs.
-- (colonne operateur_id ajoutée en 005 ; on la relie ici)
ALTER TABLE administrateurs
  ADD CONSTRAINT fk_admin_operateur
  FOREIGN KEY (operateur_id) REFERENCES bo_operateurs(id) ON DELETE SET NULL
  NOT VALID;  -- NOT VALID : n'échoue pas sur d'éventuelles lignes existantes

-- ============================================================
--  Peuplement initial, aligné sur le référentiel du portail.
-- ============================================================

-- Côte d'Ivoire (mobile money agrégateur, actif) + Togo (Moov airtime, actif).
INSERT INTO bo_pays(iso, nom, indicatif, devise, langue, longueur_num, actif) VALUES
  ('CI', 'Côte d''Ivoire', '+225', 'XOF', 'fr', 10, TRUE),
  ('TG', 'Togo',           '+228', 'XOF', 'fr', 8,  TRUE),
  ('BF', 'Burkina Faso',   '+226', 'XOF', 'fr', 8,  FALSE),
  ('SN', 'Sénégal',        '+221', 'XOF', 'fr', 9,  FALSE),
  ('ML', 'Mali',           '+223', 'XOF', 'fr', 8,  FALSE),
  ('BJ', 'Bénin',          '+229', 'XOF', 'fr', 10, FALSE)
ON CONFLICT (iso) DO NOTHING;

-- Opérateurs.
INSERT INTO bo_operateurs(pays_id, code, nom, type, taux_reversement, actif)
SELECT p.id, 'agregateur-ci', 'Mobile Money', 'mobilemoney', 70.00, TRUE
FROM bo_pays p WHERE p.iso='CI'
ON CONFLICT DO NOTHING;

INSERT INTO bo_operateurs(pays_id, code, nom, type, taux_reversement, actif)
SELECT p.id, 'moov-tg', 'Moov Africa Togo', 'airtime', 70.00, TRUE
FROM bo_pays p WHERE p.iso='TG'
ON CONFLICT DO NOTHING;

-- Moyens de paiement de l'agrégateur ivoirien.
INSERT INTO bo_moyens_paiement(operateur_id, code, nom, couleur)
SELECT o.id, m.code, m.nom, m.couleur
FROM bo_operateurs o,
  (VALUES ('orange','Orange Money','#ff7900'),
          ('mtn','MTN MoMo','#ffcc00'),
          ('moov','Moov Money','#0a6cb0'),
          ('wave','Wave','#1dc3ec')) AS m(code,nom,couleur)
WHERE o.code='agregateur-ci'
ON CONFLICT DO NOTHING;
