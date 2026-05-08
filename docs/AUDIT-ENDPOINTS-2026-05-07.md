# Auditoría de endpoints — Fase 0.2 del PLAN-REFACTOR

> **Fecha:** 2026-05-07
> **Total endpoints:** 99
> **Generado por:** `scripts/audit-endpoints.py` (en sesión nocturna 2026-05-07)

## Resumen por categoría

| Categoría | Cantidad | Acción |
|---|---|---|
| 🟡 `requireAdmin()` solo (admin/super_admin acceso global) | 19 | Eventualmente migrar a `withCompanyFilter()` para defense in depth |
| 🟡 `requireAuth()` solo (usuario logueado) | 3 | Verificar que filtra por company_id en cada query |
| 🔴 Usa service_role pero NO tiene guard explícito | 45 | **PRIORITARIO**: agregar `withCompanyFilter()` o `requireAdmin()` |
| ⚪ Cron jobs (verifican CRON_SECRET) | 5 | Verificar `CRON_SECRET` en headers |
| ⚪ Webhooks externos (verifican firma propia) | 3 | Verificar firma |
| ⚪ Portal público con token (no requiere auth) | 7 | Verificar token de un solo uso |
| ⚪ Health/debug | 2 | Sin datos sensibles |
| ⚪ No usa admin ni guard (probable cliente directo) | 15 | Verificar manualmente |

---

## 🔴 Usa service_role pero NO tiene guard explícito — 45 endpoints

- `/admin/migrate-company-data` · `admin` `cid`
- `/admin/users` · `admin` `cid`
- `/ai/agent` · `admin` `cid`
- `/ai/daily-summary` · `admin` `cid`
- `/ai/execute` · `admin`
- `/ai/ocr-receipt` · `admin` `cid`
- `/assistant/chat` · `admin` `cid`
- `/bank-statements/confirm-match` · `admin`
- `/bank-statements/parse` · `admin` `cid`
- `/buscador-clientes/[id]` · `admin`
- `/cashflow/aging` · `admin` `cid`
- `/cashflow/forecast` · `admin` `cid`
- `/companies/country-schemas` · `admin`
- `/crm/convert-lead` · `admin` `cid`
- `/documents/[id]/render` · `admin`
- `/documents/[id]/send` · `admin` `cid`
- `/documents/[id]/stock-reservations` · `admin` `cid`
- `/documents/convert` · `admin` `cid`
- `/exchange-rates/update` · `admin`
- `/fx/rates` · `admin`
- `/invoices/tango/config` · `admin` `cid`
- `/invoices/tango/emit` · `admin` `cid`
- `/invoices/tango/sync-remitos` · `admin` `cid`
- `/leads/score` · `admin`
- `/migration/stelorder` · `admin` `cid`
- `/oc/[id]/pdf` · `admin`
- `/oc/convert-to-order` · `admin` `cid`
- `/oc/create-quote` · `admin` `cid`
- `/oc/delete` · `admin`
- `/oc/delete-cascade` · `admin`
- `/oc/match` · `admin`
- `/oc/parse` · `admin` `cid`
- `/oc/reparse` · `admin`
- `/oc/request-deletion` · `admin`
- `/oc/review-deletion` · `admin`
- `/quotes/delete-cascade` · `admin`
- `/sales-orders/[id]/client-po-context` · `admin` `cid`
- `/sequences/process` · `admin` `cid`
- `/stock/check-availability` · `admin`
- `/stock/seed` · `admin` `cid`
- `/supplier-offers/apply-excel-update` · `admin` `cid`
- `/supplier-offers/parse-excel` · `admin`
- `/supplier-offers/parse-pdf` · `admin` `cid`
- `/supplier-offers/save` · `admin` `cid`
- `/suppliers/score` · `admin`

## 🟡 `requireAdmin()` solo (admin/super_admin acceso global) — 19 endpoints

- `/companies` · `admin` `cid` `reqAdmin` `reqAuth`
- `/companies/[id]` · `admin` `cid` `reqAdmin` `reqAuth` `userHasAccess`
- `/companies/[id]/addresses` · `admin` `cid` `reqAdmin` `reqAuth` `userHasAccess`
- `/companies/[id]/addresses/[addressId]` · `admin` `cid` `reqAdmin`
- `/companies/[id]/bank-accounts` · `admin` `cid` `reqAdmin` `reqAuth` `userHasAccess`
- `/companies/[id]/bank-accounts/[accountId]` · `admin` `cid` `reqAdmin`
- `/companies/[id]/documents` · `admin` `cid` `reqAdmin` `reqAuth` `userHasAccess`
- `/companies/[id]/documents/[docId]` · `admin` `cid` `reqAdmin`
- `/companies/[id]/fiscal-profile` · `admin` `cid` `reqAdmin`
- `/companies/[id]/legal-representatives` · `admin` `cid` `reqAdmin` `reqAuth` `userHasAccess`
- `/companies/[id]/legal-representatives/[repId]` · `admin` `cid` `reqAdmin`
- `/document-configs/[companyId]/[docType]` · `admin` `cid` `reqAdmin` `reqAuth` `userHasAccess`
- `/documents` · `admin` `cid` `reqAdmin` `reqAuth` `userHasAccess`
- `/documents/[id]` · `admin` `cid` `reqAdmin` `reqAuth` `userHasAccess`
- `/documents/[id]/cancel` · `reqAdmin`
- `/documents/[id]/derive` · `admin` `reqAdmin`
- `/documents/[id]/issue` · `reqAdmin`
- `/documents/[id]/lines` · `admin` `reqAdmin`
- `/documents/[id]/lines/[lineId]` · `admin` `reqAdmin`

## 🟡 `requireAuth()` solo (usuario logueado) — 3 endpoints

- `/documents/[id]/events` · `admin` `cid` `reqAuth` `userHasAccess`
- `/documents/[id]/html` · `admin` `cid` `reqAuth` `userHasAccess`
- `/documents/[id]/pdf` · `admin` `cid` `reqAuth` `userHasAccess`

## ⚪ Cron jobs (verifican CRON_SECRET) — 5 endpoints

- `/cron/alerts` · `admin`
- `/cron/catalog-rules` · `admin`
- `/cron/check-emails` · `admin`
- `/cron/daily-digest` · `admin` `cid`
- `/cron/scheduled-exports` · `admin` `cid`

## ⚪ Webhooks externos (verifican firma propia) — 3 endpoints

- `/auth/google/callback` · `admin`
- `/webhooks/gmail` · `admin` `cid`
- `/whatsapp/webhook/[webhookPath]` · `cid`

## ⚪ Portal público con token (no requiere auth) — 7 endpoints

- `/catalog/feed/[token]` · `admin` `cid`
- `/forms/[slug]` · `admin` `cid`
- `/forms/[slug]/submit` · `admin` `cid`
- `/portal/[token]` · `admin` `cid`
- `/portal/documents/[id]` · `admin`
- `/portal/supplier/[token]` · `admin` `cid`
- `/quote/[token]` · `admin` `cid`

## ⚪ Health/debug — 2 endpoints

- `/debug-env` · —
- `/health/sales-chain` · `admin` `cid`

## ⚪ No usa admin ni guard (probable cliente directo) — 15 endpoints

- `/ai/transcribe` · —
- `/auth/google` · —
- `/buscador-clientes/notify` · —
- `/catalog/feeds` · `cid`
- `/emails/recent` · —
- `/invoices/parse` · —
- `/processes` · `cid`
- `/processes/[id]` · —
- `/products/scan` · `cid`
- `/products/search` · —
- `/threads` · —
- `/whatsapp/accounts` · `cid`
- `/whatsapp/accounts/[id]` · `cid`
- `/whatsapp/send` · `cid`
- `/whatsapp/test-connection` · —

---

## Prioridades de refactor

Refactor por orden, un endpoint por commit:

1. **🔴 risky_unguarded** — agregar `withCompanyFilter()` antes de operación.
2. **🟡 requireAdmin** — agregar `applyFilter()` para defense in depth (admin sigue viendo todo, pero el filtro queda explícito).
3. **🟡 requireAuth** — verificar manual cada uno.
4. **portal/cron/webhook** — verificar mecanismos propios (token/secret/firma) en doc separado.

## Endpoints a refactorizar PRIMERO (top 10 por impacto)

1. `/oc/match` — modifica cotizaciones, podés matchear OC con cotización de otra empresa
2. `/oc/delete` y `/oc/delete-cascade` — borra OCs sin guard
3. `/oc/reparse` y `/oc/request-deletion` y `/oc/review-deletion` — modifican OCs
4. `/quotes/delete-cascade` — borra cotizaciones legacy
5. `/stock/check-availability` — lee stock cross-empresa potencial
6. `/documents/[id]/render` — renderiza HTML del doc, leak posible
7. `/oc/[id]/pdf` — PDF de OC, leak posible
8. `/buscador-clientes/[id]` — endpoint público de partners
9. `/leads/score` y `/suppliers/score` — operan sobre datos cross
10. `/exchange-rates/update` — modificación global, debería ser admin-only
