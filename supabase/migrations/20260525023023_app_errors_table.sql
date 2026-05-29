-- Logging estructurado DIY: tabla para capturar errores de la app.
-- Más adelante se puede migrar a Sentry. Esta tabla queda como
-- registro local consultable desde /admin.

CREATE TABLE IF NOT EXISTS public.tt_app_errors (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at    timestamptz NOT NULL DEFAULT now(),
  level         text NOT NULL CHECK (level IN ('error','warn','info','debug')),
  message       text NOT NULL,
  stack         text,
  url           text,
  user_agent    text,
  user_id       uuid REFERENCES tt_users(id) ON DELETE SET NULL,
  company_id    uuid REFERENCES tt_companies(id) ON DELETE SET NULL,
  context       jsonb,
  resolved      boolean NOT NULL DEFAULT false,
  resolved_at   timestamptz,
  resolved_by   uuid REFERENCES tt_users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_app_errors_created ON tt_app_errors (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_app_errors_level ON tt_app_errors (level);
CREATE INDEX IF NOT EXISTS idx_app_errors_unresolved ON tt_app_errors (created_at DESC) WHERE resolved = false;
CREATE INDEX IF NOT EXISTS idx_app_errors_user ON tt_app_errors (user_id) WHERE user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_app_errors_company ON tt_app_errors (company_id) WHERE company_id IS NOT NULL;

ALTER TABLE public.tt_app_errors ENABLE ROW LEVEL SECURITY;

-- Cualquier authenticated puede insertar errores (loggear).
-- Solo authenticated puede leerlos (en la práctica filtramos en UI por rol admin).
CREATE POLICY app_errors_insert ON public.tt_app_errors
  FOR INSERT TO authenticated
  WITH CHECK (true);

CREATE POLICY app_errors_select ON public.tt_app_errors
  FOR SELECT TO authenticated
  USING (true);

CREATE POLICY app_errors_update ON public.tt_app_errors
  FOR UPDATE TO authenticated
  USING (true)
  WITH CHECK (true);
