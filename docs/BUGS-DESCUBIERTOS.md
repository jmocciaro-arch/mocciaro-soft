# Bugs descubiertos — fuera de scope actual

> **Propósito:** registro de bugs detectados durante refactor que NO se arreglan en el PR actual.
> **Regla:** si Claude Code o cualquier dev encuentra un bug fuera del scope de la tarea actual, lo agrega acá. NO lo arregla en el mismo PR.
> **Triage:** Juan revisa esta lista al inicio de cada sprint y decide cuáles entran al backlog formal.

---

## Formato de cada bug

```markdown
### BUG-NN — Título corto

- **Descubierto:** YYYY-MM-DD por <quién o qué tarea>
- **Severidad:** crítica | alta | media | baja
- **Síntoma:** qué se observa
- **Archivo(s) sospechoso(s):** rutas relativas
- **Contexto:** qué estaba haciendo el dev cuando lo encontró
- **Workaround:** si hay alguno
- **Triage:** ⏳ pendiente | ✅ planificado en Fase X | 🚫 won't fix
```

---

## Bugs activos

### BUG-01 — Cobros vacía
- **Descubierto:** 2026-05-07 por auditoría inicial
- **Severidad:** alta
- **Síntoma:** `/cobros` no muestra ninguna fila
- **Archivo(s) sospechoso(s):** `src/app/(dashboard)/cobros/page.tsx`, `src/app/api/payments/`
- **Contexto:** post-limpieza de DB, queries pueden estar filtrando mal por `company_id` o `tt_invoice_payments` quedó vacío
- **Workaround:** ninguno
- **Triage:** ✅ planificado en Fase 2.4

### BUG-02 — Precio truncado en card de producto
- **Descubierto:** 2026-05-07 por auditoría inicial
- **Severidad:** baja
- **Síntoma:** precios largos se cortan en `/productos`
- **Archivo(s) sospechoso(s):** componente de card en `/productos`
- **Workaround:** hover muestra tooltip con precio completo (si existe)
- **Triage:** ✅ planificado en Fase 2.4

### BUG-03 — Dashboard widgets vacíos
- **Descubierto:** 2026-05-07 por auditoría inicial
- **Severidad:** media
- **Síntoma:** home muestra "0" en widgets que deberían tener datos
- **Causa probable:** queries dependen de `tt_quotes` (legacy); post-limpieza no hay filas
- **Triage:** ✅ se resuelve solo después de Fase 1.4

### BUG-04 — Stock seed para nuevas empresas
- **Descubierto:** 2026-05-07 por auditoría inicial
- **Severidad:** media
- **Síntoma:** crear empresa nueva → ir a stock → vacío sin posibilidad de inicializar
- **Archivo(s) sospechoso(s):** `src/app/(dashboard)/stock/page.tsx`, `POST /api/stock/seed`
- **Workaround:** ejecutar seed manual desde admin
- **Triage:** ✅ planificado en Fase 2.4

---

## Bugs cerrados

(vacío por ahora — mover acá los resueltos con commit hash y fecha)

---

## Notas de triage

- **Crítica:** bloquea operación de algún cliente. Atacar fuera de plan, hot-fix.
- **Alta:** afecta UX significativamente, hay workaround. Entra al sprint actual o siguiente.
- **Media:** molesta pero no bloquea. Backlog priorizado.
- **Baja:** cosmético o edge case. Backlog sin urgencia.
