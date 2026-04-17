<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

---

## 🚨 REGLA FUNDAMENTAL — Barra de proceso sticky en TODOS los documentos

Toda pantalla de documento del ERP (cotización, pedido, albarán, factura, OC, lead, SAT, etc) DEBE incluir la barra `<DocumentProcessBar>` arriba, que permanece fija al hacer scroll:

```tsx
import { DocumentProcessBar } from '@/components/workflow/document-process-bar'
import { buildSteps } from '@/lib/workflow-definitions'

<DocumentProcessBar
  code="COTI-TT-0004"
  badge={{ label: 'Borrador', variant: 'warning' }}
  entity={<span>Empresa: <strong>Torquetools SL</strong> · Cliente: <strong>Albano Cozzuol</strong></span>}
  alerts={[
    { type: 'warning', message: 'Falta condición de pago' },
    { type: 'info', message: 'Incoterm sin definir' },
  ]}
  steps={buildSteps('quote', 'conditions')}
  actions={[
    { label: 'Guardar', onClick: saveQuote, icon: 'save', variant: 'primary' },
  ]}
  onClose={() => router.back()}
/>
```

**Contenido obligatorio:**
1. Código del documento con prefijo de empresa (ej `COTI-TT-0004`)
2. Badge de estado (Borrador / Emitido / Cobrado / etc)
3. Info contextual: empresa emisora + cliente/receptor
4. Alertas del paso actual (campos faltantes, avisos, validaciones)
5. Stepper visual (workflow steps: completed / current / pending)
6. Acciones principales (Guardar / Cancelar / emitir / etc)

**Tipos de documento** disponibles en `workflow-definitions.ts`: `lead`, `opportunity`, `quote`, `sales_order`, `delivery_note`, `invoice`, `credit_note`, `purchase_order`, `client_po`, `sat_ticket`, `bank_statement`.

Para agregar tipo nuevo: editá `DocumentType` y `WORKFLOWS` en `src/lib/workflow-definitions.ts`.

Excepciones (no requieren la barra): listados/dashboards, configuraciones, modales chicos.

---

## 🥇 REGLA DE ORO — Multi-empresa del topbar filtra TODA la app

El **selector "Multi-empresa" del topbar** es la fuente única de verdad para decidir qué empresas se ven en la app. **Ningún selector/dropdown/listado** debe mostrar empresas fuera de esa selección.

### Cómo funciona

| Modo | Qué se ve en toda la app |
|---|---|
| Single (1 empresa elegida) | **Solo esa empresa**. Los dropdowns traen 1 opción. Los listados filtran por su `company_id`. |
| Multi (N empresas tildadas) | **Solo esas N**. Los dropdowns traen N opciones. Los listados filtran por `company_id IN (...)`. |

### ✅ Cómo usarlo en código

```tsx
import { useCompanyContext } from '@/lib/company-context'

function MiComponente() {
  const { visibleCompanies, activeCompanyId } = useCompanyContext()
  // visibleCompanies = lista ya filtrada según topbar
  // activeCompanyId = la primaria cuando es single-mode

  return (
    <Select
      options={visibleCompanies.map(c => ({ value: c.id, label: c.name }))}
      value={activeCompanyId}
    />
  )
}
```

### ❌ Lo que NUNCA hay que hacer

```tsx
// ❌ MAL: query propia a tt_companies sin respetar el topbar
const { data } = await supabase.from('tt_companies').select('*').eq('active', true)

// ❌ MAL: usar el array completo `companies` del contexto (trae todas las del usuario)
const { companies } = useCompanyContext()

// ✅ BIEN: usar visibleCompanies
const { visibleCompanies } = useCompanyContext()
```

### 📍 Dónde aplica
- Dropdown "Empresa emisora" del cotizador
- Dropdown "Empresa emisora" de pedidos, albaranes, facturas, OC
- Selector "Facturar desde" del módulo de facturación Tango
- Filtros de listados (CRM, compras, clientes, stock, etc) — **siempre filtrar por `.in('company_id', activeCompanyIds)`**
- KPIs del dashboard
- Widget del asistente IA (contexto inyectado)

### 🔄 Reactividad
Cuando el usuario cambia la selección en el topbar:
- `activeCompanyId`, `activeCompanyIds`, `isMultiMode`, `visibleCompanies` se actualizan
- Los componentes deben re-ejecutar sus queries con `useEffect([activeCompanyId, visibleCompanies.length], ...)`

---

## 🌍 Idioma
Responder siempre en español rioplatense (voseo).

## 📋 Prefijos de empresa (2 letras)
- `TT` → Torquetools SL (España)
- `BS` → Buscatools SA / Mocciaro Juan Manuel Jesus (AR, CUIT 20-27089205-2)
- `TQ` → Torquear SA (AR, CUIT 33-71159029-9)
- `GA` → Global Assembly Solutions LLC (USA)

Los documentos se autogeneran con formato **`COT-TT2026-0004`** (tipo-empresaAÑO-número)
via trigger SQL `next_document_code(company_id, type)` (migration v27).
Numeración se reinicia cada año. Ejemplos: `FAC-BS2026-0042`, `PED-TQ2026-0015`, `OC-TT2026-0001`.

**Tipos de prefijo de documento**:
- `COT` cotización · `PED` pedido · `ALB` albarán · `REM` remito · `PCK` packing list
- `FAC` factura · `NC` nota crédito · `ND` nota débito · `REC` recibo · `GAS` gasto
- `OC` orden compra · `FCP` factura compra · `ALC` albarán compra
- `LEAD` lead · `OPP` oportunidad · `PRE` presupuesto
