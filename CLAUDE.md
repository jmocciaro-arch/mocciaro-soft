@AGENTS.md

# Mocciaro Soft — instrucciones para Claude Code

## Contexto

ERP/CRM multi-empresa para distribución industrial. **Producción real con clientes pagos**, no es un side-project. Stack: Next.js 16 + React 19 + TS strict + Supabase (Postgres + RLS) + Vercel. Acento color `#FF6600`. UI en español rioplatense (voseo). Código en inglés.

Sistema con **deuda técnica conocida y documentada**: cuatro modelos de datos coexisten (legacy A vertical, legacy B híbrido, unificado nuevo, outlier de OCs). Ver `docs/MAPA-FLUJO-DOCUMENTAL.md` para el detalle.

## Reglas duras (no negociables)

1. **NUNCA** hagas push a `main` directo. Siempre branch `feat/*` o `fix/*` + PR. Merge lo hace Juan Manuel.
2. **NUNCA** borres datos sin migración explícita Y backup confirmado por Juan.
3. **NUNCA** hardcodees `company_id`. Usá `useCompanyFilter()` (client) y filtrado explícito por `company_id` en server. Hasta que exista un wrapper único server-side, **mostrale a Juan tu filtrado en cada endpoint nuevo o tocado**.
4. **NUNCA** uses `service_role` en código que corra en browser. Solo en endpoints `/api/*`.
5. **NUNCA** skipees pre-commit hooks (`--no-verify`).
6. **NUNCA** escribas en tablas legacy: `tt_quotes`, `tt_quote_items`, `tt_sales_orders`, `tt_so_items`, `tt_document_items`, `tt_document_links`, `tt_oc_parsed`. Solo lectura durante coexistencia. Las inserciones nuevas van a `tt_documents` + `tt_document_lines`.
7. **NUNCA** uses `any` en TypeScript. Si necesitás escape, `unknown` + narrow.
8. **NUNCA** inventes endpoints, tablas, o columnas. Verificá con `grep` o `Read` antes de escribir.
9. **NUNCA** apliques una migración SQL en producción sin que Juan haya corrido el dry-run y aprobado el output.
10. **NUNCA** tomes decisiones de negocio por tu cuenta (ver "Decisiones pendientes del usuario" abajo).

## Reglas blandas (preferencias fuertes)

- Comentá el WHY, no el WHAT. Comentarios solo cuando un futuro lector se preguntaría "¿por qué hace esto?".
- PRs ≤ 500 líneas de diff. Si excede, partilo.
- Idioma UI: voseo argentino (vos, tenés, podés). Nunca tuteo, nunca usted.
- Tests primero cuando refactorizás lógica de negocio.
- Migraciones numeradas: `supabase/migration-vNN-descripcion.sql` con bloque `-- ROLLBACK:` documentado al final.
- Nada de magic strings. Status, doc_type, relation_type → constantes en `src/lib/schemas/documents.ts`.

## Antes de cualquier cambio

1. Leé `docs/MAPA-FLUJO-DOCUMENTAL.md` y `docs/PLAN-REFACTOR.md` completos.
2. Confirmá que `npm run typecheck && npm run lint && npx playwright test tests/e2e/smoke.spec.ts` pasa antes de empezar.
3. Si vas a tocar DB: corré `pg_dump --schema-only` del estado actual y guardalo en `/tmp/schema-pre-cambio.sql` para diff posterior.
4. Si vas a tocar un endpoint que filtra por `company_id`: agregá un test E2E cross-company (user empresa A → debe NO ver datos empresa B) en el mismo PR.

## Definition of Done por PR

- [ ] `npx tsc --noEmit` sin errores
- [ ] `npm run lint` sin warnings nuevos
- [ ] Tests E2E del happy path completo (no solo smoke) pasan
- [ ] Si toca DB: migración numerada con rollback documentado
- [ ] Si toca endpoint API: test RLS cross-company pasa
- [ ] Probado en Vercel Preview antes de mergear
- [ ] Commit messages en español, descriptivos (no "fix bug")

## Plan de trabajo actual

Ver [`docs/PLAN-REFACTOR.md`](docs/PLAN-REFACTOR.md). Trabajar en orden estricto. **NO saltees fases**. La Fase 0 (cimientos) es obligatoria antes de tocar nada del modelo de datos.

## Decisiones pendientes del usuario (NO resolver por tu cuenta)

Si te encontrás con alguna de estas, **NO** tomes la decisión. Documentala en el PR y pedí confirmación a Juan:

- **Stock "non-strict" mode** (hoy se permite emitir albarán sin reserva): ¿activar strict por config de empresa?
- **OC discrepancies HIGH no bloquea conversión** a pedido: ¿bloquear hasta validación explícita con razón?
- **`doc_subtype` libre** (texto sin CHECK): ¿enum o tabla referencial?
- **TTL de signed URLs heterogéneo** (OCs 1h, facturas 1 año, statements 30d): ¿unificar y cuánto?
- **Tokens OAuth Gmail en texto plano** en `tt_system_params`: ¿pgcrypto o Supabase Vault?
- **Cron `/api/cron/check-emails` polling Gmail cada 24h**: ¿migrar a Pub/Sub push?
- **Cifrado en reposo de PII en cabecera de documentos**: ¿cifrar `counterparty_email`, `counterparty_address`?

## Reglas operativas para esta sesión

- Si no tenés información suficiente, **preguntá**. NO inventes.
- Si una migración tiene riesgo de pérdida de datos, mostrame el SQL y esperá mi OK antes de aplicar.
- Si un cambio toca >5 archivos, mostrame el plan en árbol antes de empezar.
- Si descubrís un bug fuera de tu scope actual, anotalo en `docs/BUGS-DESCUBIERTOS.md`, **NO** lo arregles en este PR.
- Si una decisión de diseño es ambigua, mostrame 2-3 opciones con pros/contras y dejame elegir. **NO** elijas vos.
- Si necesitás romper una regla de este archivo, justificá por qué y esperá autorización.
- Cada vez que termines una tarea: corré `typecheck + lint + tests` y reportame qué hiciste, qué tests pasan, qué tests fallan, qué archivos tocaste.

## Lo que NO me pidas hacer

- **Decidir arquitectura** por mi cuenta. Vos decidís, yo ejecuto.
- **Migrar datos en producción**. Yo escribo el script; vos lo corrés con dry-run primero.
- **Tocar RLS** sin tests automatizados primero.
- **Refactor "general" o "limpieza"**. Pedidos amplios = cambios amplios = bugs amplios. Una tarea por vez, scope acotado.

## Contacto

- Email: jmocciaro@gmail.com
- Time zone: UTC-3 (Argentina)
