# Mocciaro Soft — Flujos de trabajo detallados por proceso

Documento técnico para evaluación con el programador.
Versión: 2026-05-14 · Proyecto: `mocciaro-soft/` (renombrado de `cotizador-torquetools`)

---

## 0. Stack y arquitectura

| Capa | Tecnología |
|------|------------|
| Framework | Next.js 16 (App Router, Turbopack) |
| Lenguaje | TypeScript |
| UI | React + Tailwind CSS (tema light StelOrder, naranja `#FF6600`) |
| DB | Supabase Postgres (prefijo de tablas: `tt_`) |
| Auth | Supabase Auth (Google OAuth + email/password) |
| Storage | Supabase Storage (adjuntos, PDFs, fotos) |
| Realtime | Supabase Realtime (alertas, notificaciones) |
| Hosting | Vercel — `cotizador-torquetools.vercel.app` |
| PWA | Service Worker + IndexedDB para offline |

**Ubicación del repo local:** `/Users/juanmanueljesusmocciaro/mocciaro-soft/`

### Empresas multi-empresa (5 entidades)

| Empresa | País | Moneda |
|---------|------|--------|
| TorqueTools SL | España | EUR |
| BuscaTools SA | Argentina | ARS |
| Torquear SA | Argentina | ARS |
| JMJM | Argentina | ARS |
| Global Assembly Solutions LLC | USA | USD |

Tabla: `tt_companies`. Usuario puede pertenecer a múltiples vía `tt_user_companies` y elegir activa con `CompanySelector`.

### Estructura general de archivos

```
src/
├── app/
│   ├── (auth)/login              — Login Supabase (Google + email/pw)
│   ├── (dashboard)/              — Shell privado: TopNav + SubSidebar + main
│   │   ├── inicio                — Bandeja de trabajo (KPIs)
│   │   ├── catalogo              — Productos / Servicios / Gastos
│   │   ├── clientes              — Clientes, contactos, potenciales (alias CRM)
│   │   ├── cotizador             — Presupuestos
│   │   ├── ventas                — Pedidos / Albaranes / Facturas / Notas / Cobros (tabs)
│   │   ├── compras               — Proveedores / Pedidos / Recepciones / Facturas / Pagos
│   │   ├── sat                   — Servicio técnico (incidencias, hojas, repuestos…)
│   │   ├── stock                 — Inventario / Movimientos / Traspasos
│   │   ├── calendario            — Eventos y tareas
│   │   ├── informes              — Reportes BI
│   │   ├── admin                 — Usuarios, Roles, Empresas, Parámetros, etc.
│   │   ├── workflows             — Workflows / Proyectos
│   │   ├── ai-hub                — Hub IA
│   │   ├── finanzas              — Tesorería
│   │   └── documentos/[id]       — Vista detalle universal de documento
│   ├── api/                      — REST endpoints internos
│   ├── portal/[token]            — Portal externo cliente/proveedor (sin login)
│   ├── quote/[token]             — Cotización pública para aceptar/rechazar
│   └── forms/[slug]              — Forms públicos (lead capture)
├── components/
│   ├── shell/                    — TopNav, SubSidebar, StelShell (layout principal)
│   ├── ui/                       — Primitivos (Button, Card, Input, DataTable…)
│   ├── workflow/                 — DocumentProcessBar, DocumentForm, modales de transición
│   ├── admin/                    — Componentes admin (ParamsSection, BankAccountsAdmin…)
│   ├── sat/                      — Componentes SAT
│   ├── ai/                       — Receipt scanner, voice recorder, agent panel
│   └── pwa/                      — Service worker init, sync status, indicador offline
├── lib/
│   ├── document-workflow.ts      — Transiciones: Cotización → Pedido → Albarán → Factura → Cobro
│   ├── stock-ops.ts              — commit/release/dispatch de stock
│   ├── delivery-rules.ts         — Reglas de albaranes (overdelivery, full delivery, etc.)
│   ├── intercompany.ts           — Operaciones inter-empresa (TT vende a BT, BT compra a TT)
│   ├── supabase/                 — Clientes server + browser + middleware
│   ├── rbac.ts                   — getUserPermissions / hasPermission
│   ├── ai/                       — agent-executor, parse-oc-pdf, parse-bank-statement, score-lead
│   ├── email/                    — Templates email + send-email
│   ├── whatsapp/                 — Integración WhatsApp Business Cloud
│   └── stelorder-mappings.ts     — Import/export StelOrder column mappings
└── hooks/                        — use-permissions, use-documents, use-offline-data, etc.
```

---

## 1. AUTH + Multi-empresa + RBAC

### 1.1 Autenticación

- **Ruta:** `/login` ([app/(auth)/login/page.tsx](../src/app/(auth)/login/page.tsx))
- **Providers:** Google OAuth + email/password (Supabase Auth)
- **Middleware:** [src/lib/supabase/middleware.ts](../src/lib/supabase/middleware.ts) refresca sesión y redirige a `/login` si no hay sesión válida.
- **Tabla:** `auth.users` (Supabase) + `tt_users` (vincula con `auth_id`)
- **Logout:** dropdown del avatar → "Cerrar sesión" llama `supabase.auth.signOut()` y `router.push('/login')`.

### 1.2 RBAC (Role-Based Access Control)

| Tabla | Contenido |
|-------|-----------|
| `tt_roles` | 25 roles predefinidos (super_admin, admin, vendedor, comprador, sat_tecnico…) |
| `tt_permissions` | 41 permisos (view_crm, create_quote, approve_order, view_financials…) |
| `tt_role_permissions` | Mapping rol → permisos |
| `tt_user_roles` | Mapping usuario → roles |
| `tt_teams` | Agrupaciones de usuarios (no se usa todavía) |

Librería: [src/lib/rbac.ts](../src/lib/rbac.ts) expone `getUserPermissions(userId)` y `hasPermission(perm)`. Cache en memoria por usuario.

Hook: [src/hooks/use-permissions.ts](../src/hooks/use-permissions.ts) devuelve `{ permissions, hasPerm, canAny, isSuper, loading }` desde React.

**Componentes Mocciaro Soft que checkean permiso:**
- Items del sub-sidebar y top-nav (filtran items que el usuario no puede ver)
- Botones de acción dentro de cada página (Nuevo/Editar/Eliminar/Aprobar)

### 1.3 Multi-empresa

- **Contexto:** [src/lib/company-context.tsx](../src/lib/company-context.tsx) → `CompanyProvider` envuelve todo el dashboard.
- **Selector:** [components/ui/company-selector.tsx](../src/components/ui/company-selector.tsx) en el TopNav permite cambiar de empresa activa.
- **Persistencia:** localStorage + `tt_users.permissions.active_company_id`
- **Filtrado:** todas las queries de documentos/clientes/etc. filtran por `company_id` activo (excepto `super_admin` que ve todo).
- **Banner:** [components/ui/multi-company-banner.tsx](../src/components/ui/multi-company-banner.tsx) aparece arriba del contenido cuando hay multi-empresa activa.

### 1.4 Especialidades de vendedores (CRM auto-assign)

- Stored en `tt_users.permissions.specialties[]` (JSONB)
- Categorías: `torque`, `ingenieria`, `produccion`, `epp_seguridad`, `ecommerce`, `logistica`, `administracion`, `sat`, `calibracion`, `all`
- Cuando un lead entra al CRM, el sistema mira `product_interest` → matchea con la specialty del vendedor → autoasigna al staff con esa specialty.

---

## 2. CATÁLOGO

### 2.1 Productos

- **Ruta:** `/catalogo` ([page.tsx](../src/app/(dashboard)/catalogo/page.tsx))
- **Tabla:** `tt_products` (29,631 productos importados de StelOrder)
- **Campos clave:** `sku`, `name`, `brand`, `category`, `price_eur`, `cost_eur`, `price_usd`, `price_ars`, `weight_kg`, `torque_min/max`, `rpm`, `encastre`, `specs` (JSONB), `product_type: product|service|expense`, `active`, `stelorder_id`
- **Vista:** toggle Tarjetas / Tabla. Filtros: marca, familia, categoría, stock, descatalogados, etc.
- **Stock asociado:** `tt_stock` por producto × almacén (`quantity`, `reserved`, `min_quantity`)
- **Categorías:** `tt_product_categories` (jerarquía)
- **Marcas:** sin tabla propia, derivadas del campo `brand` de productos

#### Flujo de creación

1. Botón "Nuevo Producto" → modal con form (sku, nombre, brand, category, precios, peso, specs)
2. Save → INSERT en `tt_products`
3. Si tiene imagen → upload a Supabase Storage bucket `product-images`
4. Stock inicial se crea por separado desde `/stock` o se queda en 0
5. Listo para usarse en cotizaciones

#### Importación masiva

- Botón "Importar" → modal con CSV/XLSX picker
- Detección auto del formato StelOrder vía [src/lib/stelorder-mappings.ts](../src/lib/stelorder-mappings.ts)
- También soporta WooCommerce y formato genérico Mocciaro
- Validación de duplicados por SKU + acción (skip / overwrite / append)
- Bulk insert/update con progress bar

### 2.2 Servicios

- Subset de productos con `product_type='service'`
- Ruta: `/catalogo?tab=servicios` (placeholder de UI, lógica del filtro pendiente)

### 2.3 Gastos e inversiones

- **Ruta:** `/gastos` ([page.tsx](../src/app/(dashboard)/gastos/page.tsx))
- **Tabla:** `tt_documents` con `type='gasto'`
- Cargas manuales o escaneadas vía Receipt Scanner ([components/ai/receipt-scanner.tsx](../src/components/ai/receipt-scanner.tsx))
- Categorías de gasto, asociación a empresa, IVA discriminado
- También accesible desde `/compras?tab=tickets` con query param `context=compras`

---

## 3. CLIENTES / CRM

### 3.1 Clientes

- **Ruta:** `/clientes` ([page.tsx](../src/app/(dashboard)/clientes/page.tsx))
- **Tabla:** `tt_clients` (3,043 clientes)
- **Campos:**
  - **Identificación:** `legal_name`, `name`, `tax_id`, `tax_id_type`, `country`, `category`, `assigned_to`
  - **Comerciales (v69):** `currency`, `sale_condition`, `payment_method`, `payment_terms_days`, `payment_terms`, `bank_account`, `credit_limit`
  - **Entrega (v69):** `delivery_address/city/state/postal_code/country`, `delivery_contact`, `delivery_phone`, `incoterm` (Incoterms 2020), `delivery_method`, `delivery_terms`, `delivery_notes`
  - **Fiscal ES (v67):** `subject_iva`, `iva_rate`, `subject_irpf`, `irpf_rate`, `subject_re`, `re_rate`
  - **Fiscal multipaís (v69):** `fiscal_condition`, `subject_iibb`, `iibb_rate`, `iibb_jurisdiction`, `subject_ganancias`, `ganancias_rate`
  - **Otros:** `commercial_notes`, `preferred_language`

#### Vista cliente individual

- Detalle con tabs: Resumen · Comercial · Fiscal · Entrega · Contactos · Documentos · Histórico
- 360° del cliente: cotizaciones + pedidos + facturas + tickets SAT + cobros pendientes
- Botones: Nueva cotización, Nuevo lead, Editar, Eliminar (soft delete)

### 3.2 Personas de contacto

- **Tabla:** `tt_client_contacts` (FK a `tt_clients`)
- **Campos:** `name`, `position`, `email`, `phone`, `whatsapp`, `is_primary`, `notes`
- **Ruta:** `/clientes?tab=contactos`

### 3.3 Pipeline CRM (clientes potenciales / oportunidades)

- **Ruta:** `/crm` ([page.tsx](../src/app/(dashboard)/crm/page.tsx))
- **Tabla:** `tt_opportunities`
- **Campos:** `title`, `client_id`, `assigned_to`, `stage`, `value`, `probability`, `source`, `tags[]`, `expected_close_date`, `product_interest`
- **Etapas (state machine):**

```
lead → propuesta → negociacion → ganado / perdido
```

- **Vistas:**
  - Kanban (drag entre columnas)
  - Tabla (lista lineal)
  - Reportes (conversión, tiempo promedio por etapa)
- **Auto-asignación:** cuando se crea un lead nuevo, el sistema busca un vendedor con specialty matching `product_interest` y lo asigna.
- **Score:** [src/lib/ai/score-lead.ts](../src/lib/ai/score-lead.ts) usa Claude API para puntuar leads de 0-100 según señales (empresa, urgencia, presupuesto).

### 3.4 Buscador web (prospección)

- **Ruta:** `/buscador-clientes` (alias desde `/clientes/buscador-web`)
- Búsqueda inversa de empresas en internet con scraping + IA para llenar `tax_id`, `email`, `phone`, `industry`
- Requiere permiso `admin_users`

---

## 4. VENTAS — FLUJO COMPLETO (el corazón del soft)

```
   PRESUPUESTO   →   PEDIDO   →   ALBARÁN   →   FACTURA   →   COBRO
   (cotización)      (orden)      (entrega)     (factura)     (pago)

      COT-XXXX        PED-XXXX     ALB-XXXX     FAC-XXXX     COB-XXXX
```

### 4.1 Modelo unificado de documentos

**Tabla principal:** `tt_documents` (2,942 registros actuales)

| Campo | Descripción |
|-------|-------------|
| `id` | UUID |
| `type` | `presupuesto`, `pedido`, `albaran`, `factura`, `factura_abono`, `pap` (pedido a proveedor), `factura_compra`, `gasto`, `recibo` |
| `system_code` | Código interno: COT-2026-0001, PED-2026-0001, etc. |
| `display_ref` | Código mostrado al cliente (puede ser diferente, ej: incluir prefijo empresa) |
| `status` | Estado del documento (depende del type) |
| `total`, `subtotal`, `tax_amount` | Importes |
| `client_id`, `supplier_id` | FK |
| `company_id` | Empresa emisora |
| `currency` | EUR/USD/ARS |
| `metadata` | JSONB con campos específicos según type |
| `created_by`, `created_at`, `updated_at` | Auditoría |

**Líneas:** `tt_document_items` (18,703 items) — items por documento con producto/precio/cantidad/descuento.

**Relaciones doc → doc:** `tt_document_links` (973) — establece la relación padre-hijo (cotización engendra pedido, pedido engendra albaranes/facturas, etc.).

**Envíos:** `tt_document_sends` — tracking de envíos por email/whatsapp/portal (abierto, descargado, leído).

### 4.2 PRESUPUESTO (cotización)

- **Ruta:** `/cotizador` ([page.tsx](../src/app/(dashboard)/cotizador/page.tsx))
- **Tabla legacy local:** `tt_quotes` + `tt_documents` (type=presupuesto)
- **Componente clave:** [DocumentProcessBar](../src/components/workflow/document-process-bar.tsx) — barra sticky arriba con código + estado + alertas + stepper

#### Pasos del cotizador

1. **Header:** elige empresa emisora + cliente
2. **Items:** búsqueda de productos del catálogo + líneas manuales (servicios, descripciones libres)
3. **Condiciones:** Incoterm (EXW/FOB/CIF/CFR/DAP/DDP), condición de pago (Contado/30 días/50% adelanto/etc.), válido hasta (fecha)
4. **Notas:** visibles al cliente / internas (solo admin)
5. **Adjuntos:** drag & drop de pliegos/planos/specs (Supabase Storage)
6. **Totales:** subtotal + IVA (toggle 21%) + IRPF + RE (recargo de equivalencia) → total
7. **Acciones finales:** PDF/Imprimir, WhatsApp (genera link con texto + PDF), Guardar

#### State machine de cotización

```
borrador → enviada → aceptada → pedido (convertida)
                  → rechazada (terminal)
                  → vencida (auto cuando supera "valido_hasta")
```

#### Conversión Cotización → Pedido

Función: `quoteToOrder()` en [document-workflow.ts](../src/lib/document-workflow.ts)

1. Valida que la cotización esté en estado `aceptada` o `enviada`
2. Genera `PED-YYYY-NNNN` con `generateDocNumber('PED')`
3. Crea nuevo documento `type='pedido'` con todos los items copiados
4. Crea entrada en `tt_document_links` (parent=cotización, child=pedido)
5. Update status cotización → `pedido`
6. Commit reserva de stock para los items: `commitStockForOrder()` ([stock-ops.ts](../src/lib/stock-ops.ts)) → suma `reserved` en `tt_stock`
7. Idempotencia via [src/lib/idempotency.ts](../src/lib/idempotency.ts) para evitar doble conversión

#### Importación de OC de cliente

- Botón "Importar OC del cliente (PDF)" en el header del cotizador
- Upload de PDF → IA parsing con Claude vía [src/lib/ai/parse-oc-pdf.ts](../src/lib/ai/parse-oc-pdf.ts)
- Extrae: cliente, fecha, items (sku/descripción/cantidad/precio), condiciones de pago/envío
- Pre-llena el cotizador con los datos extraídos
- Usuario revisa, ajusta y guarda como cotización (o directo como pedido)

### 4.3 PEDIDO (orden de venta)

- **Ruta:** `/ventas?tab=pedidos`
- **Tabla:** `tt_documents` (type='pedido') + `tt_sales_orders` (legacy)
- **Status:** `open`, `partial_delivered`, `delivered`, `partial_invoiced`, `invoiced`, `cerrado`, `cancelled`

#### Stock reservado

Cuando se crea un pedido (o se convierte de cotización), `commitStockForOrder` suma la cantidad pedida al campo `reserved` de `tt_stock`. El campo `available = quantity - reserved`.

Si el stock no alcanza, el pedido pasa a `waiting_stock` y se dispara alerta al comprador para generar PAP (pedido a proveedor).

#### Conversión Pedido → Albarán (entrega)

Función: `orderToDeliveryNote()` en [document-workflow.ts](../src/lib/document-workflow.ts)

1. Validación previa con `validateStockForDelivery()` ([stock-ops.ts](../src/lib/stock-ops.ts)) → detecta shortfall (faltante de stock)
2. UI: [GenerateDeliveryNoteModal](../src/components/workflow/generate-delivery-note-modal.tsx) permite multi-OC (varios pedidos → un albarán) y especificar cantidades parciales
3. Reglas de albarán en [delivery-rules.ts](../src/lib/delivery-rules.ts):
   - `checkOverdelivery()`: ¿se está entregando más de lo pedido?
   - `evaluateDeliveryProposal()`: chequea cada línea
   - `isOrderFullyDelivered()`: ¿el pedido queda full delivered?
4. `dispatchStockForDelivery()`: resta del `quantity` de `tt_stock` la cantidad entregada y resta del `reserved`
5. Crea documento type='albaran' con líneas
6. Update status pedido → `partial_delivered` / `delivered`
7. `tt_document_links` link albarán → pedido

### 4.4 ALBARÁN (entrega / remito)

- **Ruta:** `/ventas?tab=albaranes`
- **Status:** `pendiente`, `enviado`, `entregado`, `cancelado`
- **Acciones:**
  - Imprimir albarán (PDF con firma del receptor)
  - Marcar entregado (cierra el ciclo)
  - Convertir a factura
- **Multi-pedido:** un albarán puede contener líneas de varios pedidos diferentes (típico cuando el cliente pide stuff en diferentes momentos y se entrega junto).

#### Conversión Albarán → Factura

Función: `deliveryNoteToInvoice()` en [document-workflow.ts](../src/lib/document-workflow.ts)

1. Genera `FAC-YYYY-NNNN`
2. Crea documento type='factura' con líneas del albarán
3. Calcula impuestos según fiscal del cliente (IVA / IRPF / RE / IIBB / Ganancias)
4. Link en `tt_document_links`
5. Update status albarán → `facturado`

### 4.5 FACTURA

- **Ruta:** `/ventas?tab=facturas`
- **Tabla:** `tt_documents` (type='factura') + `tt_invoices` (legacy)
- **Status:** `pendiente`, `cobrada`, `parcial`, `vencida`, `anulada`
- **Tipos:** Factura A/B/C (Argentina), Factura completa/simplificada (España), Factura recurrente, Factura de abono (nota de crédito)
- **Numeración:** secuencial por empresa + tipo (Argentina exige numeración por punto de venta)
- **Vista contable "Libro":** `/ventas?tab=facturas&view=libro` *(placeholder)* — listado tipo libro de IVA con totales por período

#### Facturación legal pendiente

⚠️ Actualmente las facturas son **operativas** (gestión interna). Para que sean fiscalmente válidas:
- **España:** integración con API AEAT (Verifactu)
- **Argentina:** integración con ARCA (ex-AFIP)

El sistema está preparado pero la integración fiscal está **pendiente** (warning visible en `/ventas`).

### 4.6 COBRO (Recibo de factura)

- **Ruta:** `/cobros` ([page.tsx](../src/app/(dashboard)/cobros/page.tsx))
- **Tabla:** `tt_documents` (type='recibo') + `tt_payments` (legacy)
- **Status:** `pendiente`, `aplicado`, `anulado`

#### Función `registerPayment()`

1. Crea documento type='recibo'
2. Aplica el monto a la factura asociada (puede ser pago parcial)
3. Si pago >= total factura → factura pasa a `cobrada`
4. Genera asiento contable (futuro)
5. Concilia con `tt_bank_movements` si viene de banco

### 4.7 Facturas recurrentes

- **Ruta:** `/ventas/recurrentes`
- Plantillas que generan facturas automáticamente (alquileres, mantenimientos, suscripciones)
- Cron de Vercel ([app/api/cron](../src/app/api/cron)) corre diariamente y genera las facturas del día

### 4.8 Portal del cliente

- **Ruta:** `/portal/[token]` (sin login, token único por documento)
- **Ruta:** `/portal/documents/[id]` para detalle
- Permite al cliente ver sus cotizaciones, pedidos, facturas
- Aceptar/rechazar cotizaciones desde el portal (state machine se actualiza)
- Descargar PDFs
- Tracking de apertura en `tt_document_sends`

### 4.9 Cotización pública

- **Ruta:** `/quote/[token]` (más limpio que portal, una sola cotización)
- Cliente entra con link recibido por email/WhatsApp → ve la cotización → acepta/rechaza con un click
- Trigger: status cotización pasa a `aceptada` o `rechazada`

---

## 5. SAT (Servicio Técnico)

### 5.1 Flujo similar a Ventas pero adaptado

```
INCIDENCIA → PRESUPUESTO SAT → PEDIDO DE TRABAJO → ALBARÁN DE TRABAJO → FACTURA
```

### 5.2 Incidencias (tickets)

- **Ruta:** `/sat` ([page.tsx](../src/app/(dashboard)/sat/page.tsx))
- **Tabla:** `tt_sat_tickets`
- **Campos:** `ticket_number`, `client_id`, `asset_id`, `description`, `priority` (low/medium/high/urgent), `status`, `assigned_to`, `diagnosis`, `resolution`, `parts_needed[]`
- **Status:** `open`, `in_progress`, `waiting_parts`, `resolved`, `closed`, `cancelled`
- **Sub-tabs en el dashboard SAT:** Incidencias, Hojas activas, Órdenes de trabajo, Activos/Equipos, Mantenimientos preventivos

### 5.3 Activos en clientes (parque instalado)

- **Ruta:** `/sat/activos`
- **Tabla:** `tt_sat_assets`
- **Campos:** `serial_number`, `model`, `brand`, `client_id`, `purchase_date`, `warranty_until`, `last_service_date`, `next_maintenance`, `photos[]`, `qr_code`
- **Uso:** cada activo del cliente (atornilladores, equipos calibrados, máquinas) tiene su ficha con historial completo

### 5.4 Pedidos de trabajo (hojas de servicio)

- **Ruta:** `/sat/hojas`
- **Tabla:** `tt_documents` (type='hoja_servicio') o tabla específica `tt_sat_sheets`
- Asignación de técnico, agenda, checklist, repuestos a usar
- Cuando se cierra → genera albarán de trabajo

### 5.5 Repuestos / Modelos / Manuales / Lotes / Pausadas / Histórico

- Cada uno es una vista filtrada del SAT
- `tt_sat_parts` — repuestos asociados a modelos
- `tt_sat_models` — modelos de equipos con specs
- `tt_sat_manuals` — manuales PDF asociados a modelos
- `tt_sat_lots` — lotes de calibración

---

## 6. COMPRAS

```
PROVEEDOR → PEDIDO A PROVEEDOR (PAP) → ALBARÁN DE PROVEEDOR → FACTURA DE PROVEEDOR → PAGO
```

### 6.1 Proveedores

- **Ruta:** `/compras?tab=proveedores`
- **Tabla:** `tt_suppliers` (87 proveedores) + `tt_supplier_contacts`
- **Estructura similar a clientes:** mismos campos comerciales, fiscales, entrega
- **Specialty:** algunos proveedores tienen `specialty` que matchea con productos (ej: FIAM → atornilladores, FEIN → eléctricos)

### 6.2 Pedidos a proveedor (PAP)

- **Ruta:** `/compras?tab=pedidos`
- **Tabla:** `tt_documents` (type='pap') + `tt_purchase_orders` (legacy)
- **Status:** `borrador`, `enviado`, `confirmado`, `parcial_recibido`, `recibido`, `cancelado`

#### Generación automática desde stock bajo

- Si un pedido de venta no tiene stock disponible, sistema sugiere generar PAP
- Botón "Generar PAP" → modal con productos faltantes + selector de proveedor (sugerido por specialty)

#### IA: parsing de oferta de proveedor

- Botón "Subir oferta del proveedor (PDF)" → [src/lib/ai/parse-bank-statement.ts](../src/lib/ai/parse-bank-statement.ts) o similar
- Extrae: items, precios, condiciones → pre-llena el PAP

### 6.3 Recepciones (Albaranes de proveedor)

- **Ruta:** `/compras?tab=recepciones`
- **Tabla:** `tt_documents` (type='albaran_proveedor')
- Cuando llega mercadería del proveedor, se registra recepción
- Suma al stock real (`quantity` en `tt_stock`)
- Puede haber recepciones parciales

### 6.4 Facturas de proveedor

- **Ruta:** `/compras?tab=facturas`
- **Tabla:** `tt_documents` (type='factura_compra') + `tt_purchase_invoices` (legacy)
- **Status:** `pendiente_pago`, `pagada`, `parcial`, `vencida`
- **IVA compras:** intracomunitario (España con CEE) = IVA 0% + autoliquidación, importación = IVA + aranceles

#### Workflow inteligente (memoria)

Memoria del usuario: `feedback_compras_iva_workflow.md`
- Compras intracomunitarias deben quedar con IVA 0% automáticamente
- Workflow debe detectar factura recibida y abrir flujo de pago
- Alertas de pago próximo a vencer

#### Skill `control-facturas-compra`

Existe un skill (de Claude Code) en el sistema del usuario que automatiza:
- Buscar PDFs de facturas en Google Drive (carpeta "FACTURAS DE COMPRA TT")
- Cruzar contra Excel/CSV maestro de conciliación
- Detectar faltantes, renombrar, mover a carpeta trimestral

### 6.5 Pagos (Recibos de proveedor)

- **Ruta:** `/compras?tab=pagos`
- **Tabla:** `tt_purchase_payments`
- Métodos: transferencia, cheque, efectivo, tarjeta
- Conciliación con `tt_bank_movements` (banco)

### 6.6 Tickets y otros gastos

- **Ruta:** `/gastos?context=compras`
- Mismo módulo que `/gastos` pero con badge contextual
- Gastos menores: peajes, taxis, comidas, papelería
- IVA discriminado, categoría

### 6.7 Libro de facturas recibidas

- **Ruta:** `/compras?tab=facturas&view=libro` *(placeholder)*
- Vista tipo libro de IVA compras con totales por período

---

## 7. STOCK

### 7.1 Inventario

- **Ruta:** `/stock` ([page.tsx](../src/app/(dashboard)/stock/page.tsx))
- **Tabla:** `tt_stock` (FK producto + almacén)
- **Campos:** `product_id`, `warehouse_id`, `quantity`, `reserved`, `min_quantity`, `max_quantity`, `last_count_date`
- **Almacenes:** `tt_warehouses` — múltiples almacenes (Almacén central ES, Almacén AR, Vehículos técnicos, etc.)

### 7.2 Operaciones de stock

Funciones server-side en [stock-ops.ts](../src/lib/stock-ops.ts):

| Función | Trigger | Efecto |
|---------|---------|--------|
| `commitStockForOrder` | Crear/aceptar pedido | `reserved += qty` |
| `releaseStockForOrder` | Cancelar pedido | `reserved -= qty` |
| `validateStockForDelivery` | Pre-check antes de entrega | Devuelve `StockShortfall[]` |
| `dispatchStockForDelivery` | Crear albarán de venta | `quantity -= qty`, `reserved -= qty` |
| `rollbackDispatchForDelivery` | Cancelar albarán | `quantity += qty` |

### 7.3 Traspasos entre almacenes

- **Ruta:** `/stock?tab=traspasos`
- Documento type='traspaso' que mueve cantidad de almacén A → B
- Estados: borrador → enviado → recibido

### 7.4 Movimientos

- Auditoría completa de cada cambio de stock con motivo (venta, compra, traspaso, ajuste, devolución)
- Tabla: `tt_stock_movements` (auditoría inmutable)

### 7.5 Inventario físico (count)

- Conteo periódico → comparar con sistema → generar ajustes

---

## 8. INTERCOMPANY (operaciones inter-empresa)

Tabla: `tt_intercompany_relations` define qué empresas pueden venderse entre sí.

Ej: BuscaTools (AR) le compra a TorqueTools (ES). Se genera **simultáneamente**:
1. Pedido de venta de TT (que vende)
2. Pedido de compra de BT (que compra)
3. Cuando TT entrega → genera albarán → automáticamente recepción en BT
4. Stock sale de TT y entra en BT
5. Facturación cross-border (IVA intracomunitario 0%)

Funciones en [src/lib/intercompany.ts](../src/lib/intercompany.ts):
- `createIntercompanyPurchase(buyer, seller, items)` — atómico, crea pedido en ambas empresas
- `getIntercompanyRelations(companyId)` — qué empresas tiene como contraparte
- `getAvailableSellers(buyerCompanyId)` — quién le puede vender
- `getAvailableBuyers(sellerCompanyId)` — a quién le puede vender

UI en `/compras?tab=intercompany`.

---

## 9. FACTURACIÓN (vista contable agrupada)

Nota: en el menú de StelOrder/Mocciaro Soft, "Facturación" es una **agrupación** de items que ya viven en Ventas:

- Facturas → `/ventas?tab=facturas`
- Recibos de facturas → `/cobros`
- Facturas de abono → `/ventas?tab=facturas&type=abono`
- Recibos de abono → `/cobros?type=abono` *(placeholder)*
- Facturas recurrentes → `/ventas/recurrentes`
- Libro de facturas emitidas → `/ventas?tab=facturas&view=libro` *(placeholder)*

Es el ángulo **fiscal/contable** vs el ángulo **comercial** (Ventas).

---

## 10. INFORMES (BI)

- **Ruta:** `/informes` ([page.tsx](../src/app/(dashboard)/informes/page.tsx))
- **Tabs (placeholders + reales):**
  - **De un vistazo** → KPIs generales (facturación total, pendiente cobro, top clientes)
  - **Facturación** → mensual/anual, por empresa
  - **Tesorería** → cashflow proyectado vs real
  - **Ventas** → por vendedor, por producto, por cliente, conversión
  - **SAT** → tickets resueltos, tiempo promedio, técnicos
  - **Compras** → por proveedor, vencimientos
  - **Valoración de stock** → stock × costo unitario por almacén
  - **De evolución** → time series anual
  - **Impuestos** → IVA cobrado/pagado, IRPF retenido, IIBB

### Dashboard ejecutivo

- **Ruta:** `/dashboard/ejecutivo`
- Visualizaciones interactivas con drill-down (Grafana-style con react-grid-layout)
- IA: pregúntale al dashboard ("¿cuánto facturamos en marzo?" → respuesta + chart)

---

## 11. ADMIN

### 11.1 Usuarios

- **Ruta:** `/admin?tab=usuarios`
- Listar staff, asignar roles, asignar empresas, asignar specialties
- Invitar nuevos usuarios (genera link de signup)

### 11.2 Roles

- **Ruta:** `/admin?tab=roles`
- 25 roles base + custom roles
- Editar permisos por rol

### 11.3 Empresas

- **Ruta:** `/admin?tab=empresas`
- CRUD de las 5 empresas + logo (Supabase Storage) + configuración fiscal por país

### 11.4 Parámetros

- **Ruta:** `/admin?tab=params`
- Componente: [ParamsSection](../src/components/admin/params-section.tsx)
- Agrupado en: Tipos de cambio · Cotizador · Avanzado (Integraciones, Sistema)
- Tabla DB: `tt_system_params` (key/value/description)

### 11.5 Almacenes

- **Ruta:** `/admin?tab=warehouses`
- CRUD de almacenes (`tt_warehouses`)

### 11.6 Cuentas bancarias

- **Ruta:** `/admin?tab=bank_accounts`
- Componente: [BankAccountsAdmin](../src/components/admin/bank-accounts-admin.tsx)
- Cuentas por empresa (IBAN, SWIFT, banco)

### 11.7 Auditoría

- **Ruta:** `/admin?tab=audit`
- Tabla: `tt_activity_log` (entity_type, entity_id, action, detail, user_id, timestamp)
- Log inmutable de todas las acciones del sistema (CRUD, conversiones, etc.)

### 11.8 Plantillas

- **Ruta:** `/admin?tab=plantillas`
- Plantillas de email para envío de documentos
- Plantillas PDF (logo, footer, condiciones legales)

### 11.9 Estados

- **Ruta:** `/admin?tab=estados`
- Editor visual del state machine de cada tipo de documento
- Customizable por empresa (algunas empresas pueden tener estados extra)

### 11.10 Automatizaciones

- **Ruta:** `/admin/automatizaciones` (alias `/automatizaciones`)
- Reglas if-then (cuando X → hacer Y)
- Ej: "Si factura vence en 7 días → mandar WhatsApp recordatorio"

### 11.11 WhatsApp Business

- **Ruta:** `/admin/whatsapp` (alias `/whatsapp`)
- Configuración del WhatsApp Business Cloud API
- Templates aprobados por Meta
- Webhook URL

---

## 12. INTEGRACIONES

### 12.1 StelOrder

- API Key: `a9qCD4t0P8t82nIubvjq7BhUBsP7ukCaRYU8rdxQ` (puede estar expirada)
- Migrados desde StelOrder: 29,631 productos, 3,043 clientes, 87 proveedores, 2,942 documentos
- Mappings: [src/lib/stelorder-mappings.ts](../src/lib/stelorder-mappings.ts)
- Import/export bidireccional con auto-detección de formato

### 12.2 Odoo

- Skills relacionados: `odoo-erp:odoo-crud`, `odoo-sync-stel`, `odoo-reportes`
- XML-RPC contra Odoo de TORQUETOOLS
- Sincronización: productos, clientes, pedidos, stock, precios

### 12.3 Gmail

- OAuth con `gmail.readonly` + `gmail.send`
- Tokens guardados en `tt_system_params.gmail_tokens`
- Lib: [src/lib/gmail.ts](../src/lib/gmail.ts), [src/lib/gmail-tokens.ts](../src/lib/gmail-tokens.ts)
- Uso: envío de cotizaciones/facturas, lectura de inbox para parsear OCs de clientes
- Ruta UI: `/mail` (integración tipo Inbox dentro del soft)

### 12.4 WhatsApp Business Cloud API (Meta)

- Cloud API (no Twilio)
- phone_number_id, access_token, webhook
- Templates aprobados por Meta para envío proactivo
- Lib: [src/lib/whatsapp](../src/lib/whatsapp)

### 12.5 BNA scraper (tipo cambio)

- [src/lib/bna-scraper.ts](../src/lib/bna-scraper.ts)
- Scrappea cotización USD/ARS y EUR/ARS del Banco Nación
- Cron diario actualiza `tt_system_params.usd_to_ars` y `eur_to_ars`

### 12.6 Bancos (extractos)

- Parsing de extractos PDF/CSV bancarios con IA
- Lib: [src/lib/ai/parse-bank-statement.ts](../src/lib/ai/parse-bank-statement.ts)
- API: `/api/bank-statements`
- Conciliación automática con `tt_bank_movements` (1,796 registros históricos)

### 12.7 WooCommerce (futuro)

- Sincronización productos + pedidos con tiendas WooCommerce existentes (BuscaTools)
- En roadmap, no implementado todavía

---

## 13. FEATURES DE IA

### 13.1 Hub IA

- **Ruta:** `/ai-hub` (alias `/hub-ia`)
- Centralized panel con todas las features IA disponibles

### 13.2 Receipt Scanner (escaneo de tickets)

- **Componente:** [components/ai/receipt-scanner.tsx](../src/components/ai/receipt-scanner.tsx)
- Foto/PDF de un ticket → IA extrae: total, IVA, proveedor, items, fecha
- Crea automáticamente entrada en `/gastos`

### 13.3 OC Parser (parsing de órdenes de compra de cliente)

- Lib: [src/lib/ai/parse-oc-pdf.ts](../src/lib/ai/parse-oc-pdf.ts)
- Botón "Importar OC del cliente (PDF)" en `/cotizador`

### 13.4 Voice Recorder

- **Componente:** [components/ai/voice-recorder.tsx](../src/components/ai/voice-recorder.tsx)
- Graba audio en mobile → transcribe → crea ticket SAT / lead / nota

### 13.5 Agent Panel

- **Componente:** [components/ai/agent-panel.tsx](../src/components/ai/agent-panel.tsx)
- Lib: [src/lib/ai/agent-executor.ts](../src/lib/ai/agent-executor.ts)
- Chat con agente que puede ejecutar acciones: crear cotizaciones, buscar clientes, marcar facturas como cobradas

### 13.6 Lead Scoring

- Lib: [src/lib/ai/score-lead.ts](../src/lib/ai/score-lead.ts)
- Puntúa leads del CRM de 0-100 según señales

### 13.7 Asistente del manual (Help)

- **Componente:** [components/help/help-assistant.tsx](../src/components/help/help-assistant.tsx)
- Modal que se abre con HelpCircle del top nav
- "¿Cómo hago X?" → IA responde con instrucciones del manual

### 13.8 Command Palette (⌘K)

- **Componente:** [components/command-palette.tsx](../src/components/command-palette.tsx)
- Búsqueda global: clientes, productos, documentos, leads, acciones
- Atajos: navegar a páginas, ejecutar acciones rápidas

---

## 14. PWA / Offline / Mobile

### 14.1 Service Worker

- **Init:** [components/pwa/pwa-init.tsx](../src/components/pwa/pwa-init.tsx)
- Cachea assets estáticos para uso offline
- Notifica de actualizaciones disponibles

### 14.2 Sync Status

- **Componente:** [components/pwa/sync-status.tsx](../src/components/pwa/sync-status.tsx)
- Indica si hay cambios pendientes de sincronizar (offline queue)

### 14.3 Offline data

- IndexedDB para datos críticos cacheados
- Hook: [src/hooks/use-offline-data.ts](../src/hooks/use-offline-data.ts)
- Lib: [src/lib/offline](../src/lib/offline)

### 14.4 Mobile UX

- Bottom nav con FAB central (botón "Nuevo +" naranja)
- Drawer lateral para sub-sidebar
- Responsive: cards mobile-friendly, tablas con scroll horizontal

### 14.5 Scanner móvil

- **Ruta:** `/scanner`
- Cámara para escanear códigos de barras EAN-13
- Lib: [src/lib/barcode-ean13.ts](../src/lib/barcode-ean13.ts)
- Usos: agregar productos a cotización, conteo de stock, identificar activos SAT (QR)

---

## 15. APIs internas (`/api/*`)

| Endpoint | Uso |
|----------|-----|
| `/api/admin/*` | Admin actions (impersonate, system params edit) |
| `/api/ai/*` | Wrappers de Claude API |
| `/api/assistant` | Endpoint para el agente IA |
| `/api/auth/*` | Callback OAuth, password reset |
| `/api/bank-statements` | Upload + parse de extractos bancarios |
| `/api/buscador-clientes` | Búsqueda web de empresas |
| `/api/cashflow` | Cálculos de tesorería |
| `/api/catalog` | Productos search, filtros |
| `/api/clients` | CRUD clientes, contactos |
| `/api/companies` | CRUD empresas |
| `/api/crm` | Oportunidades, leads |
| `/api/cron` | Jobs scheduled (Vercel Cron) |
| `/api/document-configs` | Templates de documentos |
| `/api/documents` | CRUD documentos genérico |
| `/api/emails` | Envío de emails |
| `/api/exchange-rates` | Get/update tipos cambio |
| `/api/forms` | Forms públicos (lead capture) |
| `/api/fx` | Conversión de moneda |
| `/api/health` | Healthcheck |
| `/api/help` | Asistente del manual |
| `/api/invoices` | CRUD facturas |
| `/api/leads` | Captación de leads |
| `/api/migration` | Imports masivos |
| `/api/oc` | Parsing de OC de cliente |
| `/api/portal` | Backend del portal del cliente |
| `/api/processes` | Workflows / automatizaciones |
| `/api/products` | CRUD productos |
| `/api/quote` | Cotización pública |
| `/api/quotes` | CRUD cotizaciones |
| `/api/sales-orders` | CRUD pedidos |
| `/api/sequences` | CRM email sequences |
| `/api/stock` | CRUD stock |
| `/api/supplier-offers` | Ofertas de proveedor |
| `/api/suppliers` | CRUD proveedores |
| `/api/threads` | Conversaciones (chat interno) |
| `/api/webhooks` | Recepción de webhooks externos |
| `/api/whatsapp` | Envío + recepción WhatsApp |

---

## 16. TABLAS DB COMPLETAS (esquema `tt_*`)

### Core
| Tabla | Registros | Descripción |
|-------|-----------|-------------|
| `tt_companies` | 5 | Empresas del grupo |
| `tt_users` | ~10 | Staff con RBAC |
| `tt_user_companies` | — | Mapping user × empresa |
| `tt_user_roles` | — | Mapping user × rol |
| `tt_roles` | 25 | Roles definidos |
| `tt_permissions` | 41 | Permisos atómicos |
| `tt_role_permissions` | — | Rol × permiso |
| `tt_teams` | 0 | Equipos (no usado) |

### Catálogo
| Tabla | Registros | Descripción |
|-------|-----------|-------------|
| `tt_products` | 29,631 | Productos catálogo |
| `tt_product_categories` | — | Jerarquía de categorías |
| `tt_stock` | — | Stock × producto × almacén |
| `tt_stock_movements` | — | Auditoría inmutable de stock |
| `tt_warehouses` | — | Almacenes |
| `tt_price_lists` | — | Multitarifas |

### Clientes & Proveedores
| Tabla | Registros | Descripción |
|-------|-----------|-------------|
| `tt_clients` | 3,043 | Clientes + ficha comercial |
| `tt_client_contacts` | — | Personas de contacto |
| `tt_suppliers` | 87 | Proveedores |
| `tt_supplier_contacts` | — | Contactos proveedor |
| `tt_opportunities` | — | Pipeline CRM |

### Documentos (unificados)
| Tabla | Registros | Descripción |
|-------|-----------|-------------|
| `tt_documents` | 2,942 | Documentos unificados (cualquier tipo) |
| `tt_document_items` | 18,703 | Líneas de documentos |
| `tt_document_links` | 973 | Relaciones doc-doc (Cot→Ped→Alb→Fac) |
| `tt_document_sends` | — | Tracking envíos (email/WhatsApp/portal) |
| `tt_document_attachments` | — | Adjuntos por documento |

### Documentos legacy (en migración)
| Tabla | Descripción |
|-------|-------------|
| `tt_quotes` | Cotizaciones locales (se está migrando a `tt_documents`) |
| `tt_sales_orders` | Pedidos venta locales |
| `tt_invoices` | Facturas locales |
| `tt_payments` | Cobros |
| `tt_purchase_orders` | Pedidos compra |
| `tt_po_items` | Líneas de PAP |
| `tt_purchase_invoices` | Facturas proveedor |
| `tt_purchase_payments` | Pagos a proveedores |

### SAT
| Tabla | Descripción |
|-------|-------------|
| `tt_sat_tickets` | Tickets de servicio técnico |
| `tt_sat_assets` | Activos en clientes (parque instalado) |
| `tt_sat_sheets` | Hojas de servicio |
| `tt_sat_parts` | Repuestos |
| `tt_sat_models` | Modelos de equipos |
| `tt_sat_manuals` | Manuales PDF |
| `tt_sat_lots` | Lotes calibración |

### Otros
| Tabla | Descripción |
|-------|-------------|
| `tt_activity_log` | Auditoría inmutable |
| `tt_notifications` | Notificaciones usuario |
| `tt_alerts` | Sistema de alertas |
| `tt_system_params` | Parámetros del sistema (key/value) |
| `tt_intercompany_relations` | Relaciones inter-empresa |
| `tt_bank_movements` | 1,796 movimientos bancarios |
| `tt_historical_records` | 17,993 registros históricos (pre-migración) |

---

## 17. ROADMAP / PENDIENTES CONOCIDOS

### En memoria del proyecto (memorias guardadas)

#### Bugs críticos / mejoras urgentes
1. Compras intracomunitarias deben quedar IVA 0% automáticamente
2. Workflow debe detectar factura recibida y abrir flujo de pago
3. Alertas de pago próximo a vencer
4. Stock real no siempre cuadra con movimientos (auditoría pendiente)

#### Features nuevas en lista
- Facturación electrónica España (Verifactu)
- Facturación electrónica Argentina (ARCA)
- Sincronización bidireccional con Odoo
- Productos compuestos (BOM / Bill of Materials)
- Vista "Libro de facturas" (emitidas y recibidas) con totales fiscales
- Tareas (separadas del calendario)
- Acceso asesor (rol externo limitado)
- Atajos de teclado documentados

### Placeholders existentes (URL funcional, lógica pendiente)
- `/catalogo?tab=servicios` (filtrar por product_type)
- `/catalogo?tab=compuestos` (productos compuestos)
- `/ventas?tab=facturas&view=libro` (vista libro contable)
- `/compras?tab=facturas&view=libro` (idem compras)
- `/cobros?type=abono` (filtro abono)
- `/calendario?view=tareas` (lista de tareas)
- `/sat/presupuestos` (presupuestos SAT separados de venta)
- `/sat/albaranes` (albaranes de trabajo)
- `/informes?tab=*` (8 sub-vistas de informes)

### Limpieza pendiente
- Migrar tablas legacy (`tt_quotes`, `tt_sales_orders`, etc.) completamente a `tt_documents`
- Eliminar inline styles dark restantes en `components/ai/*`, `finanzas/page.tsx`, `sat/activos/[id]/page.tsx` (~37 ocurrencias)
- Reescribir `/inicio` con el layout "4-cards de Ventas/SAT/Facturación/Compras" estilo StelOrder

---

## 18. CONVENIONES DE CÓDIGO

### Patrones obligatorios (de memorias del proyecto)

1. **Supabase en componentes:**
   - Crear `const supabase = createClient()` a nivel componente para funciones inline
   - En `useCallback`, crear `const sb = createClient()` DENTRO del callback
   - **NUNCA** poner `supabase` en deps de useCallback (causa loops infinitos)

2. **Returns y hooks:**
   - **NUNCA** poner `return null` antes de `useCallback/useMemo/useEffect`
   - Permission checks deben venir DESPUÉS de todos los hooks

3. **Idempotencia:**
   - Todas las transiciones de documentos usan `withIdempotency()` de [src/lib/idempotency.ts](../src/lib/idempotency.ts)
   - Key construida con `buildIdempotencyKey(operation, ...ids)`

4. **State machine de documentos:**
   - Updates de status van por `updateDocumentStatus()` en [document-workflow.ts](../src/lib/document-workflow.ts)
   - Logean en `tt_activity_log`

5. **Numeración secuencial:**
   - Códigos `XXX-YYYY-NNNN` generados por `generateDocNumber(prefix)`
   - Pattern por año, busca el max y suma 1

6. **Forms:**
   - Usar primitivos de `components/ui/` (Button, Input, Card, Modal, etc.) — no estilo inline
   - Validación con `react-hook-form` + Zod (en algunos formularios nuevos)

7. **Permisos:**
   - Toda página privada usa `usePermissions` y filtra acciones
   - Servidor también re-valida en `/api/*` antes de mutar

---

## 19. DEPLOY

- **Trigger:** `git push origin main` → Vercel detecta y deploya
- **Build:** `npx next build` (Turbopack, ~8s compile, ~200ms static gen)
- **Tiempo total:** ~2 min (build + provision)
- **Vars:** Configuradas en Vercel Dashboard (no en repo)
  - `NEXT_PUBLIC_SUPABASE_URL`
  - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
  - `SUPABASE_SERVICE_ROLE_KEY`
  - `ANTHROPIC_API_KEY`
  - `GOOGLE_OAUTH_CLIENT_ID/SECRET`
  - `WHATSAPP_*`

### Crons (Vercel Cron Jobs)

- Diario: actualizar tipos de cambio BNA
- Diario: generar facturas recurrentes
- Cada hora: chequear alertas (facturas vencidas, stock bajo)
- Cada 5 min: sync con Odoo (si activado)

---

## 20. SHELL VISUAL (UI)

Estilo final: **StelOrder light** (post-migración 2026-05-13).

| Elemento | Estilo |
|----------|--------|
| Top nav | Negro `#0F0F0F`, items en blanco, activo en naranja `#FF6600` |
| Sub-sidebar | Blanca, items en gris oscuro, activo con borde izquierdo naranja + bg `#FFF5EE` |
| Body | Gris muy claro `#F2F2F2` |
| Cards | Blanco con sombra suave `0 1px 3px rgba(0,0,0,.06)`, sin borde |
| Botones primary | Naranja `#FF6600` rectangular `rounded-md` con shadow `sm` |
| Botones secondary | Blanco con border `#E5E5E5`, hover `#F8F8F8` |
| Tabs | Sin pills, underline naranja para el activo |
| Tablas | Header gris `#F9FAFB`, hover row cream `#FFF5EE`, container con sombra |
| Badges | Píldoras pastel: verde `#D1FAE5/#065F46`, amarillo `#FEF3C7/#92400E`, etc. |
| Inputs | Blanco con border `#E5E5E5`, focus naranja `#FF6600` |
| Tipografía | Inter, tamaños 12-15px, peso 500-700 |

Componentes shell: [src/components/shell/](../src/components/shell/) (nav-tree, top-nav, sub-sidebar, stel-shell).

---

## ANEXO: Resumen de FLUJOS PRINCIPALES en una página

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                          FLUJO COMERCIAL COMPLETO                            │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  CRM (Lead)    →  Cliente   →  Cotización  →  Pedido   →  Albarán  →  Factura  →  Cobro
│  /crm             /clientes    /cotizador     /ventas     /ventas     /ventas     /cobros
│                                                ?tab=        ?tab=       ?tab=
│                                                pedidos      albaranes  facturas
│                                                                              │
│                                  ↓                                           │
│                              Stock reservado     Stock entregado             │
│                                                                              │
│                                  ↓ (si falta stock)                          │
│                              PAP a proveedor    Recepción      Factura prov  Pago
│                              /compras           /compras       /compras      /compras
│                              ?tab=pedidos       ?tab=recep     ?tab=fact     ?tab=pagos
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────┐
│                          FLUJO SAT                                           │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  Cliente activo → Ticket → Presupuesto SAT → Pedido trabajo → Albarán → Factura
│  /sat/activos     /sat     /sat/presup        /sat/hojas      /sat/alb   /ventas
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────┐
│                          FLUJO INTERCOMPANY                                  │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  Empresa A (vendedora)               Empresa B (compradora)                  │
│  ─────────────────                   ──────────────────                      │
│  Pedido venta            ←Auto-sync→ Pedido compra (PAP)                    │
│  Albarán emitido         ←Auto-sync→ Albarán recepción + stock entra        │
│  Factura emitida         ←Auto-sync→ Factura recibida + a pagar             │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## CONTACTO TÉCNICO

**Stack overview:** Next.js + Supabase + Vercel · TypeScript estricto
**Repo:** `/Users/juanmanueljesusmocciaro/mocciaro-soft/`
**Auth:** Supabase Auth (Google + email/pw)
**DB:** Supabase Postgres con 30+ tablas `tt_*`
**Estado:** Producción (Vercel) · Multi-empresa (5 empresas) · ~10 usuarios activos
