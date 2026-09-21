-- ============================================================
--  005 — Back-office : accès, rôles, permissions, périmètres.
--
--  Deux familles d'acteurs :
--   - l'équipe Ludikafrik (rôles internes, accès complet ou partiel)
--   - les opérateurs partenaires (accès limité à LEUR périmètre :
--     leur pays, leurs transactions, leurs statistiques)
--
--  Modèle RBAC : un compte a un rôle ; un rôle porte des permissions ;
--  un compte opérateur porte en plus un "périmètre" (pays + opérateur)
--  qui filtre toutes ses données.
-- ============================================================

-- La table "administrateurs" existe déjà (001_schema.sql). On l'enrichit
-- plutôt que de la recréer, et on ajoute la notion de rôle + périmètre.

-- Rôles disponibles (internes + opérateur).
CREATE TABLE IF NOT EXISTS bo_roles (
  id           BIGSERIAL PRIMARY KEY,
  code         TEXT UNIQUE NOT NULL,        -- super_admin, admin_contenu, admin_finance, support, operateur
  libelle      TEXT NOT NULL,
  interne      BOOLEAN NOT NULL DEFAULT TRUE, -- true = équipe Ludikafrik, false = opérateur partenaire
  cree_le      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Permissions atomiques (verbe.ressource). Ex: lire.finances, ecrire.jeux.
CREATE TABLE IF NOT EXISTS bo_permissions (
  id           BIGSERIAL PRIMARY KEY,
  code         TEXT UNIQUE NOT NULL,        -- ex: 'finances.lire', 'jeux.ecrire'
  libelle      TEXT NOT NULL,
  module       TEXT NOT NULL                -- regroupement : acces, pays, joueurs, jeux, finances...
);

-- Association rôle -> permissions (plusieurs à plusieurs).
CREATE TABLE IF NOT EXISTS bo_role_permissions (
  role_id        BIGINT NOT NULL REFERENCES bo_roles(id) ON DELETE CASCADE,
  permission_id  BIGINT NOT NULL REFERENCES bo_permissions(id) ON DELETE CASCADE,
  PRIMARY KEY (role_id, permission_id)
);

-- Enrichissement des comptes admin : rôle + périmètre opérateur.
ALTER TABLE administrateurs ADD COLUMN IF NOT EXISTS role_id     BIGINT REFERENCES bo_roles(id);
ALTER TABLE administrateurs ADD COLUMN IF NOT EXISTS pays_iso    TEXT;      -- périmètre pays (NULL = tous, pour l'équipe interne)
ALTER TABLE administrateurs ADD COLUMN IF NOT EXISTS operateur_id BIGINT;   -- périmètre opérateur (NULL = tous)
ALTER TABLE administrateurs ADD COLUMN IF NOT EXISTS suspendu    BOOLEAN NOT NULL DEFAULT FALSE;

-- Journal d'audit du back-office : qui a fait quoi, quand, sur quoi.
CREATE TABLE IF NOT EXISTS bo_audit (
  id           BIGSERIAL PRIMARY KEY,
  admin_id     BIGINT REFERENCES administrateurs(id) ON DELETE SET NULL,
  admin_nom    TEXT,                        -- copie du nom au moment de l'action (traçabilité)
  action       TEXT NOT NULL,               -- ex: 'operateur.cree', 'joueur.suspendu'
  ressource    TEXT,                        -- ex: 'operateur#12'
  details      JSONB,
  ip           TEXT,
  cree_le      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_boaudit_admin ON bo_audit(admin_id, cree_le);
CREATE INDEX IF NOT EXISTS idx_boaudit_action ON bo_audit(action, cree_le);

-- ============================================================
--  Peuplement : les rôles et permissions de base.
-- ============================================================

INSERT INTO bo_roles(code, libelle, interne) VALUES
  ('super_admin',    'Super administrateur', TRUE),
  ('admin_contenu',  'Admin Contenu',        TRUE),
  ('admin_finance',  'Admin Finance',        TRUE),
  ('support',        'Support',              TRUE),
  ('operateur',      'Opérateur partenaire', FALSE)
ON CONFLICT (code) DO NOTHING;

-- Permissions par module (verbe.ressource).
INSERT INTO bo_permissions(code, libelle, module) VALUES
  -- accès & rôles
  ('acces.lire',      'Voir les comptes admin',        'acces'),
  ('acces.ecrire',    'Gérer les comptes et rôles',    'acces'),
  ('audit.lire',      'Consulter le journal d''audit', 'acces'),
  -- pays & opérateurs
  ('pays.lire',       'Voir pays et opérateurs',       'pays'),
  ('pays.ecrire',     'Gérer pays et opérateurs',      'pays'),
  -- joueurs
  ('joueurs.lire',    'Voir les joueurs',              'joueurs'),
  ('joueurs.ecrire',  'Modérer les joueurs',           'joueurs'),
  -- jeux
  ('jeux.lire',       'Voir le catalogue de jeux',     'jeux'),
  ('jeux.ecrire',     'Gérer les jeux',                'jeux'),
  -- points & règles
  ('regles.lire',     'Voir les règles et barèmes',    'regles'),
  ('regles.ecrire',   'Gérer les règles et barèmes',   'regles'),
  -- pass & monétisation
  ('pass.lire',       'Voir les pass',                 'pass'),
  ('pass.ecrire',     'Gérer les pass et promos',      'pass'),
  -- finances
  ('finances.lire',   'Voir les finances',             'finances'),
  ('finances.ecrire', 'Gérer réconciliation/exports',  'finances'),
  -- compétitions
  ('competitions.lire',   'Voir les compétitions',     'competitions'),
  ('competitions.ecrire', 'Gérer les compétitions',    'competitions'),
  ('competitions.valider','Valider une compétition sponsorisée', 'competitions'),
  -- notifications
  ('notifs.lire',     'Voir les notifications',        'notifs'),
  ('notifs.ecrire',   'Créer/programmer notifications','notifs'),
  -- cms
  ('cms.lire',        'Voir le contenu CMS',           'cms'),
  ('cms.ecrire',      'Gérer bannières et textes',     'cms'),
  -- support
  ('support.lire',    'Voir les tickets',              'support'),
  ('support.ecrire',  'Traiter les tickets',           'support'),
  -- reporting
  ('reporting.lire',  'Consulter les tableaux de bord','reporting'),
  -- kyc
  ('kyc.lire',        'Voir les vérifications KYC',    'kyc'),
  ('kyc.ecrire',      'Traiter les vérifications KYC', 'kyc')
ON CONFLICT (code) DO NOTHING;

-- Attribution des permissions aux rôles.
-- Super Admin : TOUT.
INSERT INTO bo_role_permissions(role_id, permission_id)
SELECT r.id, p.id FROM bo_roles r, bo_permissions p
WHERE r.code='super_admin'
ON CONFLICT DO NOTHING;

-- Admin Contenu : jeux, règles, compétitions, notifications, cms, reporting (lecture).
INSERT INTO bo_role_permissions(role_id, permission_id)
SELECT r.id, p.id FROM bo_roles r, bo_permissions p
WHERE r.code='admin_contenu'
  AND p.module IN ('jeux','regles','competitions','notifs','cms')
ON CONFLICT DO NOTHING;
INSERT INTO bo_role_permissions(role_id, permission_id)
SELECT r.id, p.id FROM bo_roles r, bo_permissions p
WHERE r.code='admin_contenu' AND p.code IN ('reporting.lire','joueurs.lire','pays.lire')
ON CONFLICT DO NOTHING;

-- Admin Finance : finances, pass, reporting, + lecture pays/joueurs/kyc.
INSERT INTO bo_role_permissions(role_id, permission_id)
SELECT r.id, p.id FROM bo_roles r, bo_permissions p
WHERE r.code='admin_finance'
  AND (p.module IN ('finances','pass','kyc') OR p.code IN ('reporting.lire','pays.lire','joueurs.lire'))
ON CONFLICT DO NOTHING;

-- Support : joueurs (lecture + modération légère), support, lecture reporting.
INSERT INTO bo_role_permissions(role_id, permission_id)
SELECT r.id, p.id FROM bo_roles r, bo_permissions p
WHERE r.code='support'
  AND (p.module='support' OR p.code IN ('joueurs.lire','joueurs.ecrire','reporting.lire'))
ON CONFLICT DO NOTHING;

-- Opérateur partenaire : lecture SCOPÉE (finances, reporting, compétitions de son périmètre).
--   Le filtrage par pays/opérateur se fait dans le code (périmètre du compte),
--   pas ici : ces permissions donnent le DROIT, le périmètre donne l'ÉTENDUE.
INSERT INTO bo_role_permissions(role_id, permission_id)
SELECT r.id, p.id FROM bo_roles r, bo_permissions p
WHERE r.code='operateur'
  AND p.code IN ('finances.lire','reporting.lire','competitions.lire','competitions.ecrire','pays.lire')
ON CONFLICT DO NOTHING;

-- Rattacher un rôle super_admin au tout premier admin s'il n'en a pas.
UPDATE administrateurs
SET role_id = (SELECT id FROM bo_roles WHERE code='super_admin')
WHERE role_id IS NULL
  AND id = (SELECT MIN(id) FROM administrateurs);
