-- Helper RLS: mapea auth.uid() → array de company_ids del usuario
-- Usado por policies para filtrar a nivel DB en lugar de solo en cliente.

CREATE OR REPLACE FUNCTION public.auth_user_company_ids()
RETURNS uuid[]
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    array_agg(uc.company_id),
    ARRAY[]::uuid[]
  )
  FROM tt_user_companies uc
  JOIN tt_users u ON u.id = uc.user_id
  WHERE u.auth_id = auth.uid();
$$;

-- Otorgar permiso de ejecución al rol authenticated
GRANT EXECUTE ON FUNCTION public.auth_user_company_ids() TO authenticated;

-- Helper auxiliar: id del tt_users del user autenticado
CREATE OR REPLACE FUNCTION public.auth_tt_user_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT id FROM tt_users WHERE auth_id = auth.uid() LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION public.auth_tt_user_id() TO authenticated;
