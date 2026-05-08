# Mocciaro Soft — instrucciones para Claude Code

> **Última actualización:** 2026-05-07
> **Owner:** Juan Manuel Mocciaro (`jmocciaro@gmail.com`)
> **Repo:** `github.com/jmocciaro-arch/mocciaro-soft`

---

## 0. Lectura obligatoria antes de tocar nada

1. Este archivo, completo.
2. `/docs/PLAN-REFACTOR.md` — fases, prioridades, criterios de aceptación.
3. `/docs/MAPA-FLUJO-DOCUMENTAL.md` — modelo de datos y reglas de negocio.
4. `/docs/BUGS-DESCUBIERTOS.md` — bugs detectados pero fuera de scope actual.

Si alguno no existe o está desactualizado, **avisame antes de empezar**, no asumas.

---

## 1. Contexto del producto

ERP/CRM multi-empresa para distribución industrial (TORQUETOOLS y otras razones sociales). **Producción real con clientes pagos.** Cubre todo el ciclo comercial: cotización → pedido → albarán → factura → cobro, más compras, stock, OCs del cliente parseadas con IA, SAT (servicio técnico).

**Empresas activas en el sistema:**
- TORQUETOOLS S.L. (España)
- BUSCATOOLS S.A. (Argentina)
- TORQUEAR S.A. (Argentina)
- GLOBAL ASSEMBLY SOLUTIONS LLC (Miami)
- FALTA ENVIDO S.L. (España)
- MOCCIARO JUAN MANUEL (autónomo)

Cualquier cambio que rompa multi-empresa rompe el negocio entero. Es la zona más sensible.

---

## 2. Stack

| Capa | Tecnología |
|---|---|
| Framework | Next.js 16 (App Router, Turbopack) + React 19 |
| Lenguaje | TypeScript strict |
| DB / Auth / Storage | Supabase (Postgres con RLS) |
| Estilos | Tailwind 4, dark + light theme. Acento `#FF6600`. |
| Deploy | Vercel (auto-deploy desde `main`) |
| Tests | Playwright (`tests/e2e/`) + Vitest unit (`tests/unit/`) |
| Email salida | Gmail OAuth (tokens en `tt_system_params`) |
| Email transaccional | Resend |
| IA parseo OCs | Anthropic Claude (primario) + Gemini (fallback) |
| ERP externo (lectura) | StelOrder API |

---

## 3. Reglas duras — NO NEGOCIABLES

Si rompés cualquiera de estas, el PR se rechaza sin discusión.

1. **Nunca push directo a `main`.** Siempre branch `feat/*` o `fix/*` + PR.
2. **Nunca borrar datos sin migración explícita Y backup confirmado.** Si dudás, preguntá.
3. **Nunca hardcodear `company_id`.** Usá `useCompanyFilter()` (client) y `app_can_see_company()` (server).
4. **Nunca usar `service_role` desde código que corre en browser.** Solo en endpoints server.
5. **Nunca skipear pre-commit hooks** (`--no-verify` está prohibido).
6. **Nunca escribir en tablas legacy** (`tt_quotes`, `tt_quote_items`, `tt_document_items`, `tt_sales_orders`, `tt_so_items`). Solo lectura durante coexistencia.
7. **Nunca usar `any` en TypeScript.** Si necesitás escape, `unknown` + narrow.
8. **Nunca inventar endpoints, tablas, columnas o funciones.** Verificá con `view`/`grep`/`rg` antes de referenciar.
9. **Nunca commitear secretos.** `.env*` está gitignored. Si ves uno trackeado, removelo y rotá la key.
10. **Nunca aplicar migración SQL en producción desde tu sesión.** Vos generás el SQL, Juan lo corre con dry-run primero.

---

## 4. Reglas blandas — preferencias fuertes

- **Comentá el WHY, no el WHAT.** Si el código es obvio, no comentes.
- **PRs ≤ 500 líneas de diff.** Si es más grande, partilo en commits o en PRs separados.
- **Idioma UI:** español rioplatense (voseo). `vos`, `tenés`, `podés`, `querés`. Nunca `tú`, nunca `usted`.
- **Idioma código y commits internos:** inglés.
- **Idioma commit messages:** español, descriptivos. No "fix bug", sí "fix: cobros vacía cuando company_id es null".
- **Tests primero cuando refactorizás lógica de negocio.** Test rojo → código → test verde.
- **Migrations numeradas:** `supabase/migration-vNN-descripcion.sql` con bloque `-- ROLLBACK:` documentado al final.
- **Convención de naming SQL:** `tt_` prefix obligatorio, snake_case, plural para tablas (`tt_documents`), singular para funciones (`fn_issue_document`).

---

## 5. Antes de cualquier cambio — checklist

```
[ ] Leí CLAUDE.md y PLAN-REFACTOR.md actualizados
[ ] Pulleé main: git pull origin main
[ ] Creé branch desde main: git checkout -b feat/descripcion-corta
[ ] Corro y pasa: npm run typecheck && npm run lint && npx playwright test tests/e2e/smoke.spec.ts
[ ] Si voy a tocar DB: dump del schema actual a /tmp/schema-pre-cambio.sql
[ ] Identifiqué qué fase del PLAN-REFACTOR.md estoy ejecutando
[ ] Si la tarea no está en el plan, paré y pregunté antes de seguir
```

---

## 6. Definition of Done por PR

Cada PR debe cumplir TODO esto antes de pedir review:

- [ ] `npx tsc --noEmit` sin errores
- [ ] `npm run lint` sin warnings nuevos
- [ ] Tests E2E del happy path completo pasan (no solo smoke)
- [ ] Si toca DB: migración numerada con bloque `-- ROLLBACK:` documentado
- [ ] Si toca endpoint API: test RLS cross-company pasa (user empresa A no puede leer empresa B)
- [ ] Si toca UI: probado en tema claro Y oscuro, contraste WCAG AA verificado
- [ ] Probado en Vercel Preview antes de mergear
- [ ] Commit messages en español, descriptivos
- [ ] PR description en español con: qué hace, por qué, cómo testearlo, screenshots si aplica
- [ ] Linkeado al item de PLAN-REFACTOR.md que ejecuta

---

## 7. Plan de trabajo actual

Ver `/docs/PLAN-REFACTOR.md`. **Trabajar en orden estricto. NO saltees fases.**

La **Fase 0 (cimientos) es obligatoria** antes de tocar nada de modelo de datos. Sin tests E2E + RLS + staging + backups, cualquier refactor estructural es ruleta rusa.

Si Juan te pide algo fuera del plan actual, **mostrale en qué fase estás y preguntá si quiere reordenar o agregar al plan**. No tomes decisiones de scope por tu cuenta.

---

## 8. Decisiones pendientes del usuario — NO RESOLVER POR TU CUENTA

Estas son decisiones de negocio, no bugs. Si te las cruzás, dejá comentario en el PR pidiendo definición:

- **Stock "non-strict" mode:** hoy permite albarán sin reserva. ¿Activar strict?
- **OC discrepancies HIGH no bloquea conversión:** ¿bloquear hasta validación explícita?
- **`doc_subtype` libre:** ¿enum con valores cerrados o tabla referencial editable?
- **Numeración fiscal cross-empresa:** ¿contadores independientes (hoy) o pool compartido?
- **Retención de `tt_document_events`:** ¿partition por año + archivo frío después de 2 años, o todo en hot storage?

---

## 9. Convenciones de código

### TypeScript

- **Strict mode siempre.** No relajar `tsconfig.json` por conveniencia.
- **Imports absolutos** desde `@/` (ya configurado en `tsconfig`).
- **Zod para validación de inputs** en endpoints API y forms.
- **No `as` casts salvo último recurso.** Preferir narrow con `unknown` + type guards.

### React

- **Server Components por default**, Client Components solo cuando hace falta interactividad.
- **`use client` directive arriba del archivo**, no en componentes individuales.
- **Hooks custom** para lógica reutilizable, prefijo `use*`.
- **No `useEffect` para fetch de datos** — usar Server Components o React Query si hace falta cliente.

### Supabase

- **Cliente browser:** usar `createBrowserClient` de `@supabase/ssr`.
- **Cliente server:** usar `createServerClient` con cookies de Next.
- **Service role:** SOLO en endpoints `/api/*` que necesitan bypass de RLS, importado desde `@/lib/supabase/admin.ts` (que valida `process.env`).
- **Queries:** siempre seleccionar columnas explícitas, nunca `select('*')`.

### Tailwind

- **Variables CSS para tokens de tema** en `src/app/globals.css`. No hardcodear colores.
- **Utility classes** para layout, NO @apply.
- **Componentes shadcn/ui** para primitivas (button, input, dialog). No reescribir lo que ya existe.

### SQL

- **Migrations con número incremental:** `migration-vNN-descripcion.sql`.
- **Bloque `-- ROLLBACK:`** al final de cada migración con SQL para revertir.
- **Funciones con prefijo `fn_`**, triggers con prefijo `trg_`, vistas con `vw_`.
- **CHECK constraints siempre** sobre columnas con dominio cerrado (status, type, etc.).

---

## 10. Estructura del repo

```
mocciaro-soft/
├── src/
│   ├── app/
│   │   ├── (dashboard)/        # rutas con sidebar/header
│   │   │   ├── cotizador/
│   │   │   ├── ventas/
│   │   │   ├── compras/
│   │   │   ├── stock/
│   │   │   ├── facturas/
│   │   │   ├── cobros/
│   │   │   └── productos/
│   │   ├── api/                # endpoints serverless
│   │   │   ├── documents/
│   │   │   ├── oc/
│   │   │   ├── quotes/         # legacy, en deprecación
│   │   │   ├── stock/
│   │   │   ├── payments/
│   │   │   └── cron/
│   │   └── globals.css         # tokens de tema (light/dark)
│   ├── components/
│   │   ├── ui/                 # shadcn primitivas
│   │   ├── workflow/           # workflow bar, document process
│   │   ├── pwa/                # service worker, manifest helpers
│   │   └── ...
│   ├── lib/
│   │   ├── supabase/           # clientes browser/server/admin
│   │   ├── schemas/            # zod schemas + types
│   │   ├── workflow-definitions.ts
│   │   └── ...
│   └── hooks/
├── supabase/
│   ├── migration-vNN-*.sql     # migrations en orden
│   └── seed.sql                # datos de seed para dev/test
├── tests/
│   ├── e2e/                    # Playwright
│   └── unit/                   # Vitest
├── docs/
│   ├── PLAN-REFACTOR.md
│   ├── MAPA-FLUJO-DOCUMENTAL.md
│   └── BUGS-DESCUBIERTOS.md
├── public/
│   └── manifest.json           # PWA
├── CLAUDE.md                   # este archivo
├── package.json
├── tsconfig.json
└── vercel.json                 # cron jobs
```

---

## 11. Comportamiento esperado en cada sesión

### Al arrancar
1. Listame los archivos modificados desde el último commit en `main`.
2. Recordame en qué fase del plan estamos.
3. Confirmá qué tarea específica vamos a atacar hoy.

### Antes de escribir código
1. **Si tenés información suficiente:** proponé un plan en pasos antes de tocar archivos. Esperá mi OK.
2. **Si te falta info:** preguntá. NO inventes.
3. **Si la tarea cruza más de 5 archivos:** mostrame el árbol de cambios primero.

### Durante el trabajo
1. **Una tarea por vez.** Si descubrís un bug fuera de scope, anotalo en `/docs/BUGS-DESCUBIERTOS.md` y seguí.
2. **Si una migración tiene riesgo de pérdida de datos:** mostrame el SQL completo y esperá OK explícito antes de cualquier acción.
3. **Si una decisión es ambigua:** mostrame 2-3 opciones con pros/contras. NO elijas vos.
4. **Si necesitás romper una regla del CLAUDE.md:** justificá por qué y esperá autorización.

### Al terminar una tarea
Reportame, en este orden exacto:
1. Qué hiciste (1-3 líneas).
2. Qué tests corren y pasan (`typecheck`, `lint`, `e2e`).
3. Qué tests fallan, si hay alguno (con stacktrace).
4. Lista de archivos tocados.
5. Próximo paso sugerido según el plan.

---

## 12. Antipatrones explícitamente prohibidos

| Antipatrón | Por qué |
|---|---|
| `select('*')` en queries Supabase | Trae columnas innecesarias, rompe al agregar columnas sensibles |
| `any` en TypeScript | Anula la razón de usar TS strict |
| `useEffect` para fetch inicial | Hay Server Components, usar React Query o RSC |
| Modal de confirmación para acciones reversibles | Friction sin valor. Confirmar solo destructivo. |
| Toast que desaparece para errores de validación | El usuario lo perdió. Errors inline al lado del campo. |
| Console.log en código de producción | Usar logger estructurado o Sentry |
| Try/catch que swallowea errores sin loguear | Bug invisible garantizado |
| Magic numbers / strings | Constantes nombradas |
| Componentes >300 líneas | Partir en sub-componentes |
| Endpoints que no validan input con Zod | Vector de inyección y data corruption |
| Usar `tt_quotes` / `tt_document_items` para escritura | Modelo legacy en deprecación |
| Crear nueva tabla cuando podrías usar `tt_documents.metadata` JSONB | Proliferación de tablas = más superficie de bugs |

---

## 13. Cómo proponer cambios al CLAUDE.md mismo

Si encontrás reglas inconsistentes, faltantes o que no escalan: **abrí PR específico que toque solo este archivo**, con explicación. NO cambies las reglas en el mismo PR donde las querés violar.

---

## 14. Contacto

- **Owner:** Juan Manuel Mocciaro
- **Email:** jmocciaro@gmail.com
- **Time zone:** UTC-3 (Argentina)
- **Canal urgente:** WhatsApp (pedir número si lo necesitás)

---

> **Última regla:** si algo no está cubierto acá y dudás, preguntá. Mejor 5 minutos de ida y vuelta que 5 horas de código que no sirve.
