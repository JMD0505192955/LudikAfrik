-- ============================================================
--  013 — Back-office : Notifications.
--   - création / programmation
--   - chaque notification pointe vers un contenu précis de l'app
--     (classement, joueur, compétition, jeu, pass...)
-- ============================================================

CREATE TABLE IF NOT EXISTS bo_notifications (
  id            BIGSERIAL PRIMARY KEY,
  titre         TEXT NOT NULL,
  message       TEXT NOT NULL,
  icone         TEXT DEFAULT '🔔',
  -- lien profond vers un contenu de l'app :
  cible_type    TEXT,                          -- classement | joueur | competition | jeu | pass | accueil | url
  cible_ref     TEXT,                          -- id/slug de la cible (ex: 'akim', '12', 'hebdo')
  -- ciblage de l'audience :
  audience      TEXT NOT NULL DEFAULT 'tous',  -- tous | pays | actifs | essai
  pays_iso      TEXT,                          -- si audience = pays
  -- programmation :
  statut        TEXT NOT NULL DEFAULT 'brouillon', -- brouillon | programmee | envoyee | annulee
  envoi_prevu   TIMESTAMPTZ,                   -- NULL = immédiat
  envoye_le     TIMESTAMPTZ,
  cree_par      BIGINT REFERENCES administrateurs(id) ON DELETE SET NULL,
  cree_le       TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_bonotif_statut ON bo_notifications(statut, envoi_prevu);
