-- ════════════════════════════════════════════════════════════════════════
-- Migration v58 — Cifrado en reposo de tokens OAuth Gmail
-- ════════════════════════════════════════════════════════════════════════
--
-- WHY: Fase 0.7 del PLAN-REFACTOR. Hoy `tt_system_params.value`
-- guarda los tokens OAuth Gmail (access_token + refresh_token) en
-- texto plano (columna `text`). Si la RLS de tt_system_params
-- queda mal configurada o un service_role leak, alguien puede leer
-- y tomar control total del Gmail del owner.
--
-- ESTRATEGIA: usar pgcrypto (extensión nativa de Postgres ya
-- disponible en Supabase) con cifrado simétrico AES. La clave maestra
-- vive como GUC `app.oauth_encryption_key` o como Supabase Vault
-- secret (recomendado en prod).
--
-- DECISIÓN PENDIENTE PARA JUAN:
-- (a) pgcrypto + GUC (más simple, key en env Supabase)
-- (b) Supabase Vault (más seguro, key gestionada)
-- → Default: (a) por ahora. Migrar a (b) en endurecimiento.
--
-- HOW TO APPLY:
-- 1. Aplicar PRIMERO en STAGING. NO ejecutar en prod sin Juan.
-- 2. Antes de aplicar:
--      ALTER DATABASE postgres SET app.oauth_encryption_key TO 'CLAVE-LARGA-RANDOM-AQUI';
--    (la clave NO va en el repo; va en Supabase Dashboard → Settings → DB → custom params,
--     o como Vault secret).
-- 3. Después de aplicar y validar 1 sprint (15 días) ejecutar la
--    sección [DROP DE COLUMNAS PLAIN] al final manualmente.
--
-- ROLLBACK: ver bloque al final del archivo.
-- ════════════════════════════════════════════════════════════════════════

BEGIN;

-- ─────────────────────────────────────────────────────────────────────
-- 1. Asegurar pgcrypto
-- ─────────────────────────────────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

-- ─────────────────────────────────────────────────────────────────────
-- 2. Helpers de cifrado/descifrado
-- ─────────────────────────────────────────────────────────────────────
-- Lee la clave desde GUC `app.oauth_encryption_key`. Si no está
-- definida, FALLA fuerte (mejor explotar que cifrar con key vacía).

CREATE OR REPLACE FUNCTION fn_get_oauth_key()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_key text;
BEGIN
  v_key := current_setting('app.oauth_encryption_key', true);
  IF v_key IS NULL OR length(v_key) < 32 THEN
    RAISE EXCEPTION 'app.oauth_encryption_key no está configurada (mínimo 32 chars). Ver migration-v58.';
  END IF;
  RETURN v_key;
END;
$$;

REVOKE EXECUTE ON FUNCTION fn_get_oauth_key() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION fn_encrypt_oauth(p_plain text)
RETURNS bytea
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
BEGIN
  IF p_plain IS NULL THEN RETURN NULL; END IF;
  RETURN extensions.pgp_sym_encrypt(p_plain, fn_get_oauth_key());
END;
$$;

CREATE OR REPLACE FUNCTION fn_decrypt_oauth(p_cipher bytea)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
BEGIN
  IF p_cipher IS NULL THEN RETURN NULL; END IF;
  RETURN extensions.pgp_sym_decrypt(p_cipher, fn_get_oauth_key());
END;
$$;

REVOKE EXECUTE ON FUNCTION fn_encrypt_oauth(text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION fn_decrypt_oauth(bytea) FROM PUBLIC, anon, authenticated;

-- ─────────────────────────────────────────────────────────────────────
-- 3. Columna nueva en tt_system_params
-- ─────────────────────────────────────────────────────────────────────
-- Mantenemos la columna `value` (text) para no romper otros params
-- que NO son tokens (FX rates cache, settings, etc.). Agregamos
-- `value_encrypted` que solo se usa para keys sensibles.

ALTER TABLE tt_system_params
  ADD COLUMN IF NOT EXISTS value_encrypted bytea;

COMMENT ON COLUMN tt_system_params.value_encrypted IS
  'Valor cifrado con pgcrypto (pgp_sym_encrypt). Solo para keys que requieren cifrado en reposo (oauth tokens). Para valores no sensibles seguir usando `value` (text).';

-- ─────────────────────────────────────────────────────────────────────
-- 4. Migrar tokens existentes (key='gmail_tokens')
-- ─────────────────────────────────────────────────────────────────────
-- Si el row existe en plain text, lo cifra y deja `value` en NULL.
-- IMPORTANTE: este UPDATE FALLA si app.oauth_encryption_key no está
-- configurada (por diseño — preferimos romper que cifrar con key vacía).

UPDATE tt_system_params
   SET value_encrypted = fn_encrypt_oauth(value),
       value = NULL,
       updated_at = now()
 WHERE key = 'gmail_tokens'
   AND value IS NOT NULL
   AND value_encrypted IS NULL;

-- ─────────────────────────────────────────────────────────────────────
-- 5. RLS / permisos
-- ─────────────────────────────────────────────────────────────────────
-- Solo service_role debería leer value_encrypted. authenticated NO.
-- Los lectores legítimos (endpoints API) usan service_role.

REVOKE ALL ON TABLE tt_system_params FROM anon, authenticated;
GRANT SELECT (key, value, updated_at) ON tt_system_params TO authenticated;
-- service_role tiene todos los permisos por default, no hace falta GRANT.

-- ─────────────────────────────────────────────────────────────────────
-- 6. Vista helper para lectura de tokens (solo service_role)
-- ─────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION fn_read_oauth_token(p_key text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_cipher bytea;
BEGIN
  SELECT value_encrypted INTO v_cipher
    FROM tt_system_params
   WHERE key = p_key;
  IF v_cipher IS NULL THEN RETURN NULL; END IF;
  RETURN fn_decrypt_oauth(v_cipher);
END;
$$;

REVOKE EXECUTE ON FUNCTION fn_read_oauth_token(text) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION fn_write_oauth_token(p_key text, p_value text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
BEGIN
  INSERT INTO tt_system_params (key, value_encrypted, updated_at)
  VALUES (p_key, fn_encrypt_oauth(p_value), now())
  ON CONFLICT (key) DO UPDATE
    SET value_encrypted = excluded.value_encrypted,
        value = NULL,
        updated_at = excluded.updated_at;
END;
$$;

REVOKE EXECUTE ON FUNCTION fn_write_oauth_token(text, text) FROM PUBLIC, anon, authenticated;

-- ─────────────────────────────────────────────────────────────────────
-- 7. Validación post-migración
-- ─────────────────────────────────────────────────────────────────────
DO $$
DECLARE
  v_plain_count int;
  v_cipher_count int;
BEGIN
  SELECT count(*) INTO v_plain_count
    FROM tt_system_params WHERE key = 'gmail_tokens' AND value IS NOT NULL;
  SELECT count(*) INTO v_cipher_count
    FROM tt_system_params WHERE key = 'gmail_tokens' AND value_encrypted IS NOT NULL;

  IF v_plain_count > 0 THEN
    RAISE WARNING 'v58: hay % rows de gmail_tokens con value (plain) NO null. Re-ejecutar migración con app.oauth_encryption_key configurada.', v_plain_count;
  END IF;

  RAISE NOTICE 'v58 OK — gmail_tokens cifrados: %, plain restantes: %', v_cipher_count, v_plain_count;
END;
$$;

COMMIT;

-- ════════════════════════════════════════════════════════════════════════
-- DROP DE COLUMNAS PLAIN — ejecutar SOLO después de 1 sprint validado
-- ════════════════════════════════════════════════════════════════════════
-- Cuando confirmemos que el endpoint Gmail lee desde value_encrypted
-- vía fn_read_oauth_token() y que NO hay plain text restante:
--
-- BEGIN;
-- UPDATE tt_system_params SET value = NULL WHERE key = 'gmail_tokens';
-- -- (la columna `value` SIGUE existiendo para otros params no sensibles)
-- COMMIT;
-- ════════════════════════════════════════════════════════════════════════

-- ════════════════════════════════════════════════════════════════════════
-- ROLLBACK (NO ejecutar salvo emergencia, PIERDE LOS TOKENS CIFRADOS)
-- ════════════════════════════════════════════════════════════════════════
-- BEGIN;
--
-- -- Si alguien ya rotó los tokens y solo viven cifrados, hay que
-- -- forzar al usuario a reauenticarse en Google después.
--
-- ALTER TABLE tt_system_params DROP COLUMN IF EXISTS value_encrypted;
--
-- DROP FUNCTION IF EXISTS fn_read_oauth_token(text);
-- DROP FUNCTION IF EXISTS fn_write_oauth_token(text, text);
-- DROP FUNCTION IF EXISTS fn_encrypt_oauth(text);
-- DROP FUNCTION IF EXISTS fn_decrypt_oauth(bytea);
-- DROP FUNCTION IF EXISTS fn_get_oauth_key();
--
-- COMMIT;
-- ════════════════════════════════════════════════════════════════════════
