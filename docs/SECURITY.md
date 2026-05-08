# Seguridad — Mocciaro Soft V001

> **Última actualización:** 2026-05-07
> **Owner:** Juan Manuel Mocciaro

---

## 1. Modelo de aislamiento multi-empresa

El sistema mantiene N empresas en la misma DB. El aislamiento se logra en **dos capas**:

### Capa 1 — RLS (defense at rest)
- Cada tabla con datos de empresa tiene RLS habilitada con policy basada en `app_can_see_company(company_id)`.
- `service_role` bypassa RLS — **solo se usa en endpoints `/api/*`**.

### Capa 2 — Filtrado server (defense in code)
- Cada endpoint `/api/*` filtra explícitamente por `company_id`.
- Hasta que exista `withCompanyFilter()` único, **cada PR que toque endpoints requiere review manual del filtrado**.

⚠ **Sin Fase 0.2 del PLAN-REFACTOR (tests RLS cross-company), el aislamiento depende de no olvidarse en ningún endpoint.** Es la zona de mayor riesgo.

---

## 2. Reglas de service_role

- **Único archivo autorizado** para importarlo: `src/lib/supabase/admin.ts`.
- CI tiene un guard que rechaza el PR si otro archivo referencia `SUPABASE_SERVICE_ROLE_KEY`.
- **Nunca se expone al browser**. Si lo veés en un Client Component, es un bug crítico.

---

## 3. Tokens OAuth (Gmail)

- Se persisten en `tt_system_params(key='gmail_tokens')`.
- **A partir de migration v58**: cifrados en reposo con `pgcrypto` usando `app.oauth_encryption_key` (GUC).
- Lectura: `fn_read_oauth_token('gmail_tokens')`.
- Escritura: `fn_write_oauth_token('gmail_tokens', json_string)`.

**Antes de v58**: estaban en plain text. Auditar `git log -p supabase/` para confirmar que la migración corrió.

---

## 4. Signed URLs

Buckets privados (Supabase Storage). TTLs heterogéneos hoy (decisión pendiente):
- `client-pos` (PDFs OC) → 1h
- Facturas → 1 año
- Bank statements → 30d

**Pendiente:** unificar criterio + ruta `/p/:token` que regenere URL on demand para emails.

---

## 5. Reglas para endpoints nuevos

Todo endpoint en `src/app/api/*` debe:

1. Validar autenticación con `createServerClient()` antes de leer datos.
2. Recuperar el `company_id` del usuario (helper compartido).
3. Filtrar TODA query por `company_id` (o usar `service_role` solo para queries que ya tengan el filtro explícito).
4. Validar input con Zod.
5. NO devolver IDs de otras empresas en respuestas.
6. Tener test cross-company en `tests/e2e/rls-cross-company.spec.ts`.

---

## 6. Reportar incidentes

Si encontrás un leak potencial (ejemplo: GET devuelve documentos de otra empresa), **NO commitear el bug fix sin avisar antes**. Mandá WhatsApp a Juan, evaluamos juntos si hay que rotar credenciales.

---

## 7. TODO de seguridad pendiente

Ver `docs/PLAN-REFACTOR.md` Fase 0 y Fase 3 para la lista completa. Resumen:

- Wrapper único `withCompanyFilter()` server-side.
- Tests RLS cross-company en CI.
- Cifrado de PII en cabecera de documentos (`counterparty_email`, `counterparty_address`).
- Auditoría externa de RLS (pen-test) antes de onboarding clientes pagos nuevos.
- Rotación trimestral de tokens y service_role keys.
