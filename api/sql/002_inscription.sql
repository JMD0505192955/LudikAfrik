-- ============================================================
--  002 — Inscription des abonnés par code SMS (OTP).
--
--  N'ajoute que ce qui manque. La table "abonnes" existe déjà
--  (001_schema.sql) et possède déjà "pseudo" et "telephone" :
--  on ne la recrée pas, on s'appuie dessus.
--
--  Deux tables nouvelles, préfixées "otp_" pour rester lisibles.
-- ============================================================

-- Codes en attente de vérification. Le code n'est jamais stocké
-- en clair : seulement son empreinte (sha256 + sel serveur).
CREATE TABLE IF NOT EXISTS otp_codes (
  id          BIGSERIAL PRIMARY KEY,
  telephone   TEXT        NOT NULL,               -- format international, +226…
  empreinte   TEXT        NOT NULL,               -- sha256(code + sel)
  cree_le     TIMESTAMPTZ NOT NULL DEFAULT now(),
  expire_le   TIMESTAMPTZ NOT NULL,
  essais      INTEGER     NOT NULL DEFAULT 0,
  verifie     BOOLEAN     NOT NULL DEFAULT FALSE,
  consomme    BOOLEAN     NOT NULL DEFAULT FALSE, -- true une fois l'inscription finalisée
  ip          TEXT
);

CREATE INDEX IF NOT EXISTS idx_otp_tel    ON otp_codes(telephone);
CREATE INDEX IF NOT EXISTS idx_otp_expire ON otp_codes(expire_le);

-- Journal des demandes d'envoi, pour la limitation par numéro et par IP.
CREATE TABLE IF NOT EXISTS otp_demandes (
  id          BIGSERIAL PRIMARY KEY,
  telephone   TEXT        NOT NULL,
  ip          TEXT,
  cree_le     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_otpdem_tel ON otp_demandes(telephone, cree_le);
CREATE INDEX IF NOT EXISTS idx_otpdem_ip  ON otp_demandes(ip, cree_le);
