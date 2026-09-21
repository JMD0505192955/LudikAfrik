-- ============================================================
--  003 — Codes d'accès des canaux USSD et SMS.
--
--  Après paiement sur le téléphone (USSD ou SMS), l'opérateur
--  envoie un CODE au client. Il revient le saisir sur le site.
--  On stocke l'empreinte du code, pas le code en clair.
-- ============================================================

CREATE TABLE IF NOT EXISTS codes_acces (
  id            BIGSERIAL PRIMARY KEY,
  telephone     TEXT        NOT NULL,
  code_hash     TEXT        NOT NULL,
  forfait       TEXT        NOT NULL,            -- jour | semaine | mois
  reconduction  BOOLEAN     NOT NULL DEFAULT FALSE,
  reference     TEXT,                            -- référence du prélèvement opérateur
  cree_le       TIMESTAMPTZ NOT NULL DEFAULT now(),
  expire_le     TIMESTAMPTZ NOT NULL,
  consomme      BOOLEAN     NOT NULL DEFAULT FALSE
);

CREATE INDEX IF NOT EXISTS idx_codacc_tel ON codes_acces(telephone, consomme);
