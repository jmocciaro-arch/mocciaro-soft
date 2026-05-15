-- ════════════════════════════════════════════════════════════════════════
-- migration-v75: Permisos RBAC para overdelivery + emisión legal
-- ════════════════════════════════════════════════════════════════════════
-- FASE 1.5 + FASE 2 (anticipado).
--
-- AGREGA:
--   - allow_overdelivery: emitir REM por cantidad mayor a la pendiente
--     del PED. Default: solo super_admin. Requiere campo
--     motivo_sobreentrega en el REM.
--   - emit_legal_invoice: emitir factura legal contra API fiscal
--     (TusFacturas AR / Verifacti ES). Default: solo super_admin y
--     rol fiscal_admin (creado acá).
--   - rol fiscal_admin: para Juan en cada empresa, separado de admin
--     operativo. Tiene emit_legal_invoice + view_legal_invoice +
--     void_legal_invoice.
--   - confirm_send_manually: confirmar envío en el modal "¿Lo mandaste?"
--     (FASE 0 — disponible para todos los roles que crean documentos).
--
-- IDEMPOTENTE.
-- ════════════════════════════════════════════════════════════════════════

BEGIN;

-- ─────────────────────────────────────────────────────────────────────
-- 1. Insertar permisos nuevos en tt_permissions
-- ─────────────────────────────────────────────────────────────────────
INSERT INTO public.tt_permissions (name, description)
VALUES
  ('allow_overdelivery',
   'Emitir albarán/remito con cantidad superior a la pendiente del pedido (requiere motivo).'),
  ('emit_legal_invoice',
   'Emitir factura legal contra API fiscal (AR-ARCA / ES-AEAT-Verifactu). Acción con efecto fiscal real.'),
  ('view_legal_invoice',
   'Ver detalles fiscales de facturas emitidas (CAE, hash Verifactu, comprobante AFIP).'),
  ('void_legal_invoice',
   'Anular legalmente una factura emitida (nota de crédito automática).'),
  ('confirm_send_manually',
   'Confirmar envío de documento en el modal "¿Lo mandaste? Sí/No/Cancelar".'),
  ('manage_bank_accounts',
   'Crear/editar/desactivar cuentas bancarias de cobro (tt_bank_accounts).')
ON CONFLICT (name) DO UPDATE
  SET description = EXCLUDED.description;

-- ─────────────────────────────────────────────────────────────────────
-- 2. Rol fiscal_admin (separado del admin operativo)
-- ─────────────────────────────────────────────────────────────────────
INSERT INTO public.tt_roles (name, description, is_system)
VALUES (
  'fiscal_admin',
  'Administrador fiscal: única vía a emit_legal_invoice. Asignar a Juan en todas las empresas.',
  true
)
ON CONFLICT (name) DO UPDATE
  SET description = EXCLUDED.description;

-- ─────────────────────────────────────────────────────────────────────
-- 3. Wire role_permissions
-- ─────────────────────────────────────────────────────────────────────

-- Helper inline: insertar role→permission si no existe
DO $$
DECLARE
  v_role_id UUID;
  v_perm_id UUID;
  v_rp RECORD;
BEGIN
  -- super_admin obtiene TODO automáticamente vía isSuper en rbac.ts,
  -- pero agregamos explícitamente por consistencia de queries.
  FOR v_rp IN
    SELECT 'super_admin'::TEXT AS role, perm FROM (VALUES
      ('allow_overdelivery'),
      ('emit_legal_invoice'),
      ('view_legal_invoice'),
      ('void_legal_invoice'),
      ('confirm_send_manually'),
      ('manage_bank_accounts')
    ) AS p(perm)
    UNION ALL
    SELECT 'fiscal_admin', perm FROM (VALUES
      ('emit_legal_invoice'),
      ('view_legal_invoice'),
      ('void_legal_invoice'),
      ('manage_bank_accounts'),
      ('confirm_send_manually')
    ) AS p(perm)
    UNION ALL
    -- Roles operativos NO obtienen emit_legal_invoice ni overdelivery
    -- por default. Sí obtienen confirm_send_manually.
    SELECT r, 'confirm_send_manually' FROM (VALUES
      ('admin'),
      ('vendedor'),
      ('comprador'),
      ('gerente_ventas'),
      ('logistica'),
      ('administracion')
    ) AS p(r)
  LOOP
    SELECT id INTO v_role_id FROM tt_roles WHERE name = v_rp.role;
    SELECT id INTO v_perm_id FROM tt_permissions WHERE name = v_rp.perm;

    IF v_role_id IS NOT NULL AND v_perm_id IS NOT NULL THEN
      INSERT INTO tt_role_permissions (role_id, permission_id)
      VALUES (v_role_id, v_perm_id)
      ON CONFLICT DO NOTHING;
    END IF;
  END LOOP;
END $$;

-- ─────────────────────────────────────────────────────────────────────
-- 4. Helper RPC: chequear si user_id tiene permiso X
--    Usado por endpoints server-side antes de ejecutar acciones
--    fiscales o sobreentregas.
-- ─────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION user_has_permission(p_user_id UUID, p_permission TEXT)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    -- super_admin bypass
    SELECT 1 FROM tt_user_roles ur
    JOIN tt_roles r ON r.id = ur.role_id
    WHERE ur.user_id = p_user_id AND r.name = 'super_admin'
  ) OR EXISTS (
    SELECT 1 FROM tt_user_roles ur
    JOIN tt_role_permissions rp ON rp.role_id = ur.role_id
    JOIN tt_permissions p ON p.id = rp.permission_id
    WHERE ur.user_id = p_user_id AND p.name = p_permission
  );
$$;

COMMENT ON FUNCTION user_has_permission IS
  'Chequea si un usuario tiene un permiso (vía sus roles). super_admin pasa siempre.';

COMMIT;

-- ════════════════════════════════════════════════════════════════════════
-- ROLLBACK:
--   BEGIN;
--   DELETE FROM tt_role_permissions
--     WHERE permission_id IN (
--       SELECT id FROM tt_permissions
--       WHERE name IN ('allow_overdelivery','emit_legal_invoice',
--                      'view_legal_invoice','void_legal_invoice',
--                      'confirm_send_manually','manage_bank_accounts')
--     );
--   DELETE FROM tt_permissions WHERE name IN (
--     'allow_overdelivery','emit_legal_invoice','view_legal_invoice',
--     'void_legal_invoice','confirm_send_manually','manage_bank_accounts'
--   );
--   DELETE FROM tt_roles WHERE name = 'fiscal_admin';
--   DROP FUNCTION IF EXISTS user_has_permission(uuid, text);
--   COMMIT;
-- ════════════════════════════════════════════════════════════════════════
