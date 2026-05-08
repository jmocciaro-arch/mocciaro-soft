# Cómo usar Claude Code con este repo

> **Para:** Juan Manuel Mocciaro
> **Propósito:** instrucciones operativas de cómo arrancar sesiones con Claude Code y mantener calidad.

---

## Setup inicial (una sola vez)

1. Instalar Claude Code:
   ```bash
   npm install -g @anthropic-ai/claude-code
   ```
   (Requiere Node.js 18+. Verificá con `node --version`.)

2. Autenticación:
   ```bash
   claude login
   ```

3. Clonar el repo y entrar:
   ```bash
   git clone https://github.com/jmocciaro-arch/mocciaro-soft.git
   cd mocciaro-soft
   ```

4. Verificar que `CLAUDE.md` está en la raíz y los docs están en `/docs/`:
   ```bash
   ls CLAUDE.md docs/PLAN-REFACTOR.md docs/BUGS-DESCUBIERTOS.md
   ```

5. Levantar el stack local:
   ```bash
   npm install
   cp .env.example .env.local   # completar valores
   npm run dev
   ```

---

## Cómo arrancar una sesión

Desde la raíz del repo:

```bash
claude
```

Y como **primer mensaje** pegá esto, ajustando según la fase actual:

```
Leé CLAUDE.md y docs/PLAN-REFACTOR.md completos antes de responder.

Estamos en Fase 0 (cimientos). Empezá por 0.1: suite E2E Playwright
que cubra cotización→pedido→albarán→factura→cobro × 2 empresas
distintas, usando datos de seed reproducibles.

Antes de escribir código:
1. Listame los archivos existentes en tests/e2e/
2. Mostrame el contenido de smoke.spec.ts actual
3. Mostrame cómo se hace seed de datos hoy (si existe)
4. Proponé un plan en pasos antes de tocar archivos

NO escribas código todavía. Esperá mi OK al plan.
```

---

## Reglas operativas durante una sesión

### Antes de aprobar cambios, exigí:

1. **Plan en pasos numerado.** Si no lo tira, pedilo.
2. **Lista de archivos a tocar.** Si son >5, pedí justificación.
3. **Si toca DB:** SQL completo + bloque ROLLBACK + dry-run.
4. **Si toca endpoint:** test RLS cross-company en el mismo PR.

### Mientras trabaja, vigilá:

- Que no escriba en tablas legacy (`tt_quotes`, `tt_quote_items`, `tt_document_items`).
- Que no use `any` en TypeScript.
- Que no haga `select('*')` en queries Supabase.
- Que cada commit message esté en español y sea descriptivo.
- Que no haga push directo a `main` (siempre PR).

### Al terminar cada tarea, pedí reporte:

```
Reportame ahora, en este orden:
1. Qué hiciste (1-3 líneas)
2. Qué tests pasan (typecheck, lint, e2e)
3. Qué tests fallan, si hay (con stacktrace)
4. Lista de archivos tocados
5. Próximo paso sugerido según el plan
```

---

## Cuándo NO usar Claude Code

| Situación | Por qué no | Alternativa |
|---|---|---|
| Decidir arquitectura | Va a inventar algo razonable pero distinto al tuyo | Vos decidís, después le pasás la decisión |
| Migrar datos en producción | Riesgo de pérdida silenciosa | Que escriba el script. Vos lo corrés con dry-run |
| Tocar RLS sin tests previos | Zona más peligrosa del sistema | Hacé Fase 0.2 primero |
| Refactor "general" o "limpieza" | Scope amplio = bugs amplios | Una tarea acotada por vez |
| Decisiones de UX que afectan flujo | Va a optar por defaults genéricos | Vos definís, él implementa |
| Tareas de Fase 3 sin decisión previa | Va a asumir y romper | Definí D1-D7 primero (ver PLAN-REFACTOR §Decisiones) |

---

## Comandos útiles dentro de la sesión

| Comando | Uso |
|---|---|
| `/help` | Ayuda general |
| `/clear` | Reiniciar contexto (perdés historial) |
| `/cost` | Ver costo acumulado de la sesión |
| `/exit` | Salir |

---

## Reglas adicionales para pegar al iniciar tareas complejas

Si la tarea es delicada (migración, RLS, refactor estructural), agregá esto al prompt inicial:

```
Reglas adicionales para esta tarea:

- Si no tenés información suficiente, preguntá. NO inventes.
- Si una migración tiene riesgo de pérdida de datos, mostrame el SQL
  y esperá mi OK explícito antes de aplicar nada.
- Si un cambio toca >5 archivos, mostrame el plan en árbol antes
  de empezar.
- Si descubrís un bug fuera de tu scope actual, anotalo en
  docs/BUGS-DESCUBIERTOS.md, NO lo arregles en este PR.
- Si una decisión de diseño es ambigua, mostrame 2-3 opciones con
  pros/contras y dejame elegir. NO elijas vos.
- Si necesitás romper una regla del CLAUDE.md, justificá por qué y
  esperá autorización.
- Cada vez que termines una tarea: corré typecheck + lint + tests +
  reportame en formato del CLAUDE.md §11.
```

---

## Anti-patrones que tenés que cortar de raíz

1. **Pedirle "arregla todos los bugs".** Va a arreglar 10, romper 3, no enterarte. Una tarea por vez.
2. **Aprobar PRs sin leerlos.** Siempre revisá el diff antes de mergear, aunque pasen tests.
3. **Usar Claude Code en `main` directamente.** Siempre branch.
4. **Dejarlo correr migraciones SQL en prod.** Vos las aplicás con dry-run.
5. **Saltearte el reporte final.** Si no te lo da, pedilo. Sin reporte, no sabés qué pasó.

---

## Costos estimados de Claude Code

Sonnet 4 (default) en uso intensivo de refactor: U$D 3-8 por sesión productiva de 1-2h. Opus 4.7 (más caro pero más capaz para arquitectura): U$D 15-30 por sesión similar.

Recomendación práctica: **Sonnet para implementación, Opus para diseño y review crítico**.

---

## Cuándo escalar a humano

Algunas tareas no las hace bien Claude Code, ni siquiera con buen prompting:

- **Decisiones de modelado de datos con múltiples trade-offs.** Necesitás dev senior con experiencia en el dominio.
- **Migraciones de datos en producción con clientes activos.** Riesgo demasiado alto.
- **Auditorías de seguridad RLS profundas.** Pen-test por humano externo.
- **Decisiones de pricing/billing.** Implicaciones legales y comerciales.
- **Negociación con APIs externas (StelOrder, Anthropic) sobre límites.** Contacto humano.

Para Fase 0 y migraciones de Fase 1: **dev humano senior obligatorio para review**, aunque el código lo escriba Claude.

---

> **Última regla:** si Claude Code te dice "está listo para producción" sin que vos hayas validado en staging, **NO le creas**. Validá vos siempre.
