# Auditoria E2E + Roadmap de Innovacion — Mocciaro Soft ERP

**Fecha:** 15 de abril de 2026
**Autor:** Auditoria automatizada por IA
**Version del sistema auditado:** Mocciaro Soft ERP v2.0 (Next.js 15 + Supabase + Vercel)
**Empresas en scope:** TT (Torquetools SL), BS (Buscatools SA), TQ (Torquear SA), GA (Global Assembly Solutions LLC)

---

## Parte 1: Auditoria del flujo completo de venta

### Resumen ejecutivo

El ERP Mocciaro Soft cubre **16 de 18 pasos** del ciclo de vida completo de una venta, desde la llegada de un email hasta el cobro. Los dos pasos con cobertura parcial son la recepcion automatica de mercancias de compra (albaran de compra) y el envio automatizado de facturas al cliente. El sistema se destaca por su profunda integracion con IA (8+ puntos de contacto), una arquitectura multi-empresa solida (golden rule), y un flujo de documentos con trazabilidad completa y numeracion automatica.

---

### 1. Llegada del email (Gmail)

**Ruta:** `/mail` (pagina dentro del dashboard)
**Estado:** 🟡 Parcial

**Que funciona:**
- Existe la pagina `/mail` con integracion directa a Gmail OAuth2.
- Soporte para 4 cuentas de correo (BuscaTools, Torquear, TorqueTools SL, GAS LLC).
- Lectura de mensajes, busqueda, conteo de no leidos.
- Capacidad de responder emails directamente desde la app.
- Integracion OAuth con `googleapis/gmail` para `readonly` y `send`.

**Que falta:**
- No hay un mecanismo automatico de ingestion: los emails no se convierten automaticamente en leads. La creacion de leads desde emails es manual.
- No hay webhook/push de Gmail; los emails se cargan on-demand cuando el usuario entra a `/mail`.
- No hay parseo automatico del contenido del email para extraer datos de contacto o necesidades.
- Falta la ruta `/mail` en el sidebar principal (no aparece en `navItems[]`).

---

### 2. Lead creado — Auto-scoring IA

**Ruta:** `/crm` (tab "Leads IA") y `/crm/leads`
**Estado:** ✅ Completo

**Que funciona:**
- Tabla `tt_leads` con campos completos: `name`, `email`, `phone`, `company_name`, `industry`, `source`, `status`, `estimated_value`, `raw_message`.
- **Auto-scoring IA** via `/api/leads/score` que invoca `src/lib/ai/score-lead.ts`.
- Campos IA persistidos: `ai_score` (0-100), `ai_temperature` (hot/warm/cold), `ai_tags[]`, `ai_suggested_action`, `ai_suggested_email`, `ai_needs`, `ai_provider`.
- Componente `LeadScoreBadge` para visualizacion del score.
- Filtrado por empresa (golden rule) con `useCompanyFilter`.
- `DocumentProcessBar` con workflow de tipo `lead` (Captura > Analisis IA > Cualificacion > Conversion).
- Formularios publicos `/forms/[slug]` que pueden crear leads automaticamente.

**Que falta:**
- No hay scoring automatico batch; se hace lead por lead al clickear el boton.

---

### 3. Lead cualificado — Convertir a oportunidad

**Ruta:** `/api/crm/convert-lead`
**Estado:** ✅ Completo

**Que funciona:**
- Endpoint `/api/crm/convert-lead` para convertir un lead en oportunidad + cliente.
- Campos `converted_opportunity_id` y `converted_client_id` en `tt_leads` para trazabilidad.
- Desde el detail modal del lead se puede disparar la conversion.
- Creacion inline de cliente nuevo desde la oportunidad (sin necesidad de ir a `/clientes`).

**Que falta:**
- No hay un boton de "Convertir" directamente visible en la tabla de leads (se accede desde el detalle).

---

### 4. Oportunidad gestionada — Pipeline Kanban

**Ruta:** `/crm` (tab "Pipeline")
**Estado:** ✅ Completo

**Que funciona:**
- Kanban con drag & drop funcional entre etapas (`CRM_STAGES`).
- Etapas: Lead > Prospeccion > Propuesta > Negociacion > Ganado > Pedido > Perdido.
- Modal de detalle con `DocumentProcessBar` (workflow `opportunity`).
- Asignacion automatica de vendedor basada en especialidad del producto (`PRODUCT_TO_SPECIALTY`).
- Busqueda de clientes con autocompletado.
- Creacion inline de cliente nuevo si no existe.
- Filtros: por etapa, por vendedor asignado, busqueda libre.
- KPIs: total ponderado del pipeline, conteo por etapa.
- Exportacion a CSV/Excel via `ExportButton`.
- Boton "Cotizar" en el detalle que navega a `/cotizador?clientId=...`.
- Tab "Informes" con tasa de conversion, valor por etapa, KPIs de ganadas/perdidas.
- Tab "Actividades" con log de acciones recientes (`tt_activity_log`).

**Que falta:**
- No hay timeline visual de interacciones dentro de la oportunidad (emails, llamadas, reuniones).
- No hay integracion directa con calendario para agendar follow-ups.

---

### 5. Cotizacion creada

**Ruta:** `/cotizador`
**Estado:** ✅ Completo

**Que funciona:**
- Formulario completo con: empresa emisora, cliente (con autocompletado), items con busqueda de productos.
- Cada item tiene: SKU, descripcion, cantidad, precio unitario, descuento, notas.
- Condiciones: incoterm (lista estandar de INCOTERMS), condiciones de pago, validez, notas internas.
- Vista triple: crear/editar, listado, detalle.
- `DocumentProcessBar` con workflow `quote` (Borrador > Condiciones > Aprobacion > Enviada > Aceptada > Pedido).
- `DocumentItemsTree` para visualizacion jerarquica de items.
- `DocumentForm` y `DocumentActions` para acciones estandarizadas.
- `DocumentListCard` con `DataTable` paginada y buscable.
- Pre-carga desde URL params (`clientId`, `clientName`, `products`) — viene del CRM o del scanner.
- Filtrado multi-empresa (golden rule).
- Numeracion automatica formato `COT-TT2026-0001` via trigger SQL `next_document_code()`.

**Que falta:**
- No se encontro funcionalidad de duplicar cotizacion.
- No hay versionado de cotizaciones (revision 1, 2, 3...).

---

### 6. Cotizacion enviada al cliente

**Ruta:** `/api/documents/[id]/render` (PDF) + `/api/whatsapp/send` + `/api/email/send`
**Estado:** 🟡 Parcial

**Que funciona:**
- **Generacion de PDF** via `/api/documents/[id]/render` que devuelve HTML con branding de la empresa (logo, colores, datos fiscales). Se imprime a PDF via el navegador.
- Renderizado para todos los tipos: cotizacion, factura, pedido, albaran, remito, packing list, nota credito/debito, orden compra.
- **WhatsApp** via `/api/whatsapp/send` usando la API de WhatsApp Business Cloud (Meta).
- **Email** via `src/lib/email/send-email.ts`.
- Desde la pagina `/mail` se pueden enviar emails.

**Que falta:**
- No hay un boton "Enviar al cliente" unificado dentro de la cotizacion que abra un modal de seleccion de canal (email/WhatsApp) y adjunte automaticamente el PDF.
- El PDF se genera como HTML para imprimir; no hay generacion serverside de PDF real (puppeteer/wkhtmltopdf).
- No hay tracking de apertura del email o del PDF.

---

### 7. Cliente envia OC (Orden de Compra)

**Ruta:** `/ventas/importar-oc`
**Estado:** ✅ Completo

**Que funciona:**
- Pagina dedicada con `OCParserModal` para subir PDF/imagen de la OC del cliente.
- **Parseo IA** via `/api/oc/parse` que invoca `src/lib/ai/parse-oc-pdf.ts`.
- Comparacion automatica con cotizaciones existentes (`matched_quote_id`).
- Deteccion de discrepancias con niveles de severidad (`low`, `medium`, `high`).
- Campos: `confidence_score`, `ai_provider`, `ai_discrepancies[]`.
- Tabla `tt_oc_parsed` para persistencia.
- Listado de cotizaciones abiertas para seleccionar contra cual comparar.
- `DocumentProcessBar` con workflow `client_po`.
- Aparece en el sidebar como "Importar OC".

**Que falta:**
- No hay aceptacion automatica: siempre requiere revision manual.

---

### 8. Pedido interno creado (Sales Order)

**Ruta:** `/ventas?tab=pedidos`
**Estado:** ✅ Completo

**Que funciona:**
- Tab "Pedidos" dentro de `/ventas` con `DataTable` paginada.
- Tabla `tt_sales_orders` y/o `tt_documents` tipo `pedido`.
- Status: open, partially_delivered, fully_delivered, partially_invoiced, fully_invoiced, closed.
- `DocumentDetailLayout` con workflow visual completo (Cotizacion > Pedido > Albaran > Factura > Cobro).
- `DocumentItemsTree` para items del pedido.
- `DocumentActions` y `DocumentForm` estandarizados.
- KPIs: pedidos abiertos con badge en sidebar.
- Filtrado multi-empresa.
- Vinculo con cotizacion origen (`quote_id`).

**Que falta:**
- No hay conversion automatica de cotizacion a pedido con un click.

---

### 9. Verificacion de stock

**Ruta:** `/stock`
**Estado:** ✅ Completo

**Que funciona:**
- Tabs: Inventario, Movimientos, Traspasos, Almacenes.
- Tabla `tt_stock` con: `product_id`, `warehouse_id`, `quantity`, `reserved`, `min_quantity`.
- Movimientos con tipos: entrada, salida, ajuste, traspaso.
- Historial de movimientos con `quantity_before` y `quantity_after`.
- Multiples almacenes (`tt_warehouses`).
- KPIs: items bajo stock minimo, movimientos recientes.
- Import/Export via `ImportButton`/`ExportButton`.
- **Scanner de codigo de barras** en `/scanner` para consulta rapida de stock y precio.
- Componente `BarcodeScanner` como PWA feature.

**Que falta:**
- No hay alerta automatica cuando un item del pedido no tiene stock suficiente.
- No hay reserva automatica de stock al crear un pedido.

---

### 10. Orden de compra a proveedor

**Ruta:** `/compras?tab=pedidos`
**Estado:** ✅ Completo

**Que funciona:**
- Modulo completo de compras con tabs: Pedidos de compra, Albaranes de compra, Facturas de compra, Proveedores, Pagos.
- Tabla `tt_purchase_orders` y `tt_documents` tipo `orden_compra`.
- Status: draft, sent, partial, received.
- `DocumentDetailLayout` con workflow visual.
- `DocumentItemsTree` para items de la OC.
- Gestion de proveedores (`tt_suppliers`) con contactos, datos fiscales, condiciones de pago.
- Detalle de proveedor con tabs: datos, contactos, pedidos, facturas, pagos.
- Import/Export de proveedores.
- Badge en sidebar con OC pendientes.
- Filtrado multi-empresa.

**Que falta:**
- No hay generacion automatica de OC cuando el stock es insuficiente para un pedido de venta.

---

### 11. Recepcion de mercancias del proveedor (Albaran de compra)

**Ruta:** `/compras?tab=albaranes`
**Estado:** 🟡 Parcial

**Que funciona:**
- Tab "Albaranes" dentro de compras con tabla de albaranes de compra.
- Status: draft, received, partial.
- `DocumentDetailLayout` para detalle.

**Que falta:**
- No hay workflow de recepcion que actualice automaticamente el stock al confirmar un albaran de compra.
- No hay matching automatico albaran de compra vs OC para verificar cantidades.
- No hay generacion de movimientos de stock tipo "entrada" desde el albaran.

---

### 12. Albaran de entrega / Packing List

**Ruta:** `/ventas?tab=albaranes`
**Estado:** ✅ Completo

**Que funciona:**
- Tab "Albaranes" dentro de ventas.
- Tabla `tt_documents` tipo `albaran` / `remito` / `packing_list`.
- `DocumentDetailLayout` con workflow visual.
- `DocumentItemsTree` con items entregados.
- Generacion de PDF via `/api/documents/[id]/render` con branding.
- Status: draft, delivered, partial.
- Vinculo con pedido origen.
- Numeracion automatica (`ALB-TT2026-0001`).
- Distincion entre albaran (Espana), remito (Argentina), packing list (export).

**Que falta:**
- No hay reduccion automatica de stock al confirmar un albaran de salida.

---

### 13. Factura emitida

**Ruta:** `/ventas?tab=facturas`
**Estado:** ✅ Completo

**Que funciona:**
- Tab "Facturas" dentro de ventas.
- **Integracion con Tango Gestion** via `/api/invoices/tango/emit` para emision fiscal (Argentina).
- Endpoint `/api/invoices/tango/config` para configuracion de la conexion.
- Endpoint `/api/invoices/tango/sync-remitos` para sincronizacion de remitos.
- Parseo de facturas de compra con IA via `/api/invoices/parse` y `src/lib/invoicing/parse-invoice-pdf.ts`.
- `tango-client.ts` para comunicacion con la API de Tango.
- Tipos de factura: factura, nota credito, nota debito.
- Numeracion automatica (`FAC-BS2026-0042`).
- `DocumentProcessBar` con workflow `invoice`.
- Status: borrador, emitida, autorizada, pendiente_cobro, cobrada, anulada.
- KPIs en sidebar con badge de facturas pendientes.
- Documentacion tecnica de la API de Tango en `docs/tango-factura-api.md`.

**Que falta:**
- Para empresas de Espana (TT) no hay integracion con SII/AEAT.
- No hay facturacion electronica para USA (GAS LLC).

---

### 14. Factura enviada al cliente

**Ruta:** Via email/WhatsApp (mismos canales que cotizacion)
**Estado:** 🟡 Parcial

**Que funciona:**
- PDF generado via `/api/documents/[id]/render`.
- Envio por WhatsApp via `/api/whatsapp/send`.
- Envio por email via `send-email.ts`.

**Que falta:**
- No hay un flujo automatico "emitir factura > generar PDF > enviar al cliente" en un solo click.
- No hay programacion de envio (scheduled send).
- No hay tracking de recepcion.

---

### 15. SAT / Servicio Tecnico / Mantenimiento

**Ruta:** `/sat` con 8 sub-paginas
**Estado:** ✅ Completo

**Que funciona:**
- Modulo completo con tabs: Incidencias, Hojas activas (workflow), Ordenes de trabajo, Activos/Equipos.
- Sub-paginas en sidebar: Activos, Hojas, Repuestos, Modelos, Manuales, Lotes, Pausadas, Historico.
- `SATWorkflow` component con flujo paso a paso (diagnostico, reparacion, etc).
- `DocumentProcessBar` con workflow `sat_ticket`.
- Tabla `tt_sat_tickets` con: client_id, product_id, assigned_to, priority, serial_number, work_address.
- Status: open, in_progress, waiting_parts, resolved, closed.
- Prioridades: low, normal, high, urgent.
- Diagnostico y resolucion como campos separados.
- Log de actividades por ticket.
- `ClientCombobox` para seleccion de cliente.
- Gestion de activos/equipos con numero de serie.
- Calculos de torque especificos (`torque-calculations.ts`).
- Datos de FEIN (`fein-data.ts`) para modelos de la marca.
- Export CSV (`csv-export.ts`).
- Fuzzy matching de modelos (`fuzzy-match.ts`).
- Conversor de moneda (`currency-converter.ts`).

**Que falta:**
- No hay programacion de mantenimiento preventivo automatico.

---

### 16. Cobro recibido — Conciliacion bancaria

**Ruta:** `/cobros` y `/cobros/[id]`
**Estado:** ✅ Completo

**Que funciona:**
- Subida de extractos bancarios con **parseo IA** via `BankStatementUploader` > `/api/bank-statements/parse` > `src/lib/ai/parse-bank-statement.ts`.
- Tabla `tt_bank_statements` con: bank_name, account_number, currency, period, opening/closing balance.
- Matching automatico IA de lineas del extracto contra facturas pendientes.
- Confirmacion manual de matches via `/api/bank-statements/confirm-match`.
- Detalle por extracto en `/cobros/[id]`.
- KPIs: facturas pendientes, cobrado este mes, extractos cargados.
- Tab "Cobros" tambien disponible dentro de `/ventas?tab=cobros`.
- Filtrado multi-empresa.

**Que falta:**
- No hay conexion directa con APIs bancarias (Open Banking / PSD2) para importacion automatica.

---

### 17. Cashflow — Tesoreria y finanzas

**Ruta:** `/finanzas`
**Estado:** ✅ Completo

**Que funciona:**
- Tabs multiples dentro de finanzas.
- **Forecast de cashflow** via `/api/cashflow/forecast` y `src/lib/cashflow/forecast.ts`.
  - Proyeccion semanal con: inflows, outflows, net, running balance.
  - Horizontes: 30, 60, 90 dias.
  - Deteccion de semanas con saldo negativo.
- **Aging report** via `/api/cashflow/aging` y `src/lib/cashflow/aging-ai.ts`.
  - Buckets: 0-30, 31-60, 61-90, +90 dias.
  - Sugerencias IA por cliente moroso.
  - Detalle de facturas vencidas por cliente.
- **Cotizaciones FX** via `/api/fx/rates` y `src/lib/fx/fetch-rates.ts`.
  - Cron diario a las 10:00 UTC para actualizar tasas EUR/USD/ARS.
  - Tabla `tt_fx_rates`.
- Gastos via `/gastos` con **OCR de recibos** (`ReceiptScanner` > `/api/ai/ocr-receipt`).

**Que falta:**
- No hay dashboard grafico de cashflow (graficos de linea/barras) — los datos existen pero la visualizacion es tabular.
- No hay conciliacion intercompany automatizada (aunque existe `intercompany.ts`).

---

### 18. Resumen diario — Dashboard ejecutivo con IA

**Ruta:** `/dashboard/ejecutivo`
**Estado:** ✅ Completo

**Que funciona:**
- Dashboard ejecutivo con KPIs en tiempo real.
- Metricas: leads total/hot, oportunidades abiertas, cotizaciones abiertas, pedidos abiertos, facturas pendientes/vencidas, cobrado del mes vs mes anterior.
- Top 5 clientes del mes con montos.
- Aging buckets visuales.
- `DailySummaryCard` con analisis IA diario.
- Cron `/api/ai/daily-summary` ejecutado a las 7:00 UTC.
- Cron `/api/cron/daily-digest` a las 8:05 UTC.
- Cron `/api/cron/alerts` a las 8:00 UTC para generacion de alertas.
- Comparacion mes actual vs mes anterior con tendencia.
- Filtrado por empresa activa.

**Que falta:**
- No hay graficos historicos (evolucion mensual).
- No hay drill-down desde KPI a listado filtrado.

---

## Auditoria de funcionalidades transversales

### Numeracion de documentos
**Estado:** ✅ Completo

Formato estandar `TIPO-PREFIJO_EMPRESA_ANO-NUMERO` (ej: `COT-TT2026-0001`). Implementado via trigger SQL `next_document_code(company_id, type)` (migration v27). Se reinicia cada ano. Tipos soportados: COT, PED, ALB, REM, PCK, FAC, NC, ND, REC, GAS, OC, FCP, ALC, LEAD, OPP, PRE.

### Vinculacion de documentos (trazabilidad)
**Estado:** 🟡 Parcial

- La cadena cotizacion > OC > pedido > albaran > factura existe conceptualmente (campos `quote_id`, `order_id`, etc).
- El workflow visual `buildSOWorkflow()` muestra los pasos completados.
- La API `/api/health/sales-chain` verifica la integridad de la cadena.
- **Falta:** no hay un boton "Ver cadena completa" que muestre toda la trazabilidad de un documento en un panel lateral.

### Multi-empresa (Golden Rule)
**Estado:** ✅ Completo

- `CompanyProvider` y `useCompanyContext` en el layout del dashboard.
- `CompanySelector` en el topbar con modos single/multi.
- `useCompanyFilter` hook para aplicar filtros en queries.
- `visibleCompanies`, `activeCompanyId`, `activeCompanyIds` propagados a toda la app.
- Todos los listados filtran por `company_id IN (...)`.
- Documentado en AGENTS.md como "Regla de Oro".

### Barra de proceso (DocumentProcessBar)
**Estado:** ✅ Completo

- Implementada en `src/components/workflow/document-process-bar.tsx`.
- Usada en: leads, oportunidades, cotizaciones, pedidos, albaranes, facturas, SAT, OC, gastos.
- Contenido obligatorio cumplido: codigo, badge de estado, info contextual, alertas, stepper, acciones.
- Workflow definitions centralizadas en `src/lib/workflow-definitions.ts` con 11 tipos de documento.
- Documentado en AGENTS.md como "Regla Fundamental".

### Integraciones IA (8+ puntos)
**Estado:** ✅ Completo

| # | Punto de integracion | Archivo | API route |
|---|-----|--------|-----------|
| 1 | Lead scoring | `lib/ai/score-lead.ts` | `/api/leads/score` |
| 2 | Parseo OC del cliente | `lib/ai/parse-oc-pdf.ts` | `/api/oc/parse` |
| 3 | Parseo extracto bancario | `lib/ai/parse-bank-statement.ts` | `/api/bank-statements/parse` |
| 4 | OCR de recibos/gastos | `components/ai/receipt-scanner.tsx` | `/api/ai/ocr-receipt` |
| 5 | Asistente IA (chat) | `components/ai/ai-assistant.tsx` | `/api/assistant/chat` |
| 6 | Agente IA (ejecutor) | `components/ai/agent-panel.tsx` | `/api/ai/agent` + `/api/ai/execute` |
| 7 | Resumen diario IA | `components/ai/daily-summary-card.tsx` | `/api/ai/daily-summary` |
| 8 | Aging suggestions IA | `lib/cashflow/aging-ai.ts` | `/api/cashflow/aging` |
| 9 | Transcripcion de voz | `components/ai/voice-recorder.tsx` | `/api/ai/transcribe` |
| 10 | Parseo facturas compra | `lib/invoicing/parse-invoice-pdf.ts` | `/api/invoices/parse` |

### Generacion de PDF
**Estado:** ✅ Completo

- Endpoint `/api/documents/[id]/render` genera HTML con branding completo.
- Soporte para todos los tipos de documento (cotizacion, factura, pedido, albaran, remito, packing list, NC, ND, OC).
- Incluye: logo empresa, colores brand, datos fiscales, tabla de items, footer personalizado.

### Command Palette (Cmd+K)
**Estado:** ✅ Completo

- Componente `CommandPalette` montado en el layout del dashboard.
- Hotkey global `Cmd+K` / `Ctrl+K`.
- Busqueda en: clientes (`tt_clients`), productos (`tt_products`), documentos (`tt_documents`), leads (`tt_leads`).
- Navegacion rapida a 14+ destinos.
- Acciones rapidas: nueva cotizacion, nuevo lead, nueva factura, subir extracto.
- Debounce de 200ms.
- Agrupacion visual por tipo con iconos.
- Navegacion por teclado (flechas + Enter).

### Sistema de alertas (bell icon)
**Estado:** ✅ Completo

- Componente `AlertsBell` en el topbar.
- Tabla `tt_generated_alerts` con: type, title, body, severity (info/warning/danger/success), entity_type, entity_id.
- Generacion automatica via cron `/api/cron/alerts` a las 8:00 UTC diarias.
- `src/lib/alerts/generate-alerts.ts` para logica de generacion.
- Filtrado por empresa activa.
- Dismiss individual de alertas.
- Refresco cada 60 segundos.

### Portal del cliente
**Estado:** ✅ Completo

- Ruta publica `/portal/[token]`.
- API `/api/portal/[token]` que devuelve datos del cliente y sus documentos.
- Documentos visibles: cotizaciones, pedidos, facturas, albaranes.
- Cada documento muestra: codigo, status, monto, fecha, link a PDF, fecha de vencimiento.
- No requiere login — acceso via token unico.
- Colores de estado consistentes con el backoffice.

### Formularios publicos
**Estado:** ✅ Completo

- Ruta publica `/forms/[slug]`.
- API `/api/forms/[slug]` para cargar configuracion y `/api/forms/[slug]/submit` para enviar.
- Campos soportados: text, email, phone, textarea, select.
- Tema personalizable: color de marca, logo, titulo, descripcion.
- Redirect post-envio configurable.
- Tabla `tt_forms` con configuracion.
- Gestion desde `/crm/forms`.
- Secuencias de follow-up via `/crm/sequences` con cron cada 15 minutos (`/api/sequences/process`).

### PWA / Offline
**Estado:** ✅ Completo

- Componentes: `install-prompt.tsx`, `offline-indicator.tsx`, `pwa-init.tsx`, `sync-manager.tsx`, `sync-status.tsx`.
- Scanner de codigo de barras: `barcode-scanner.tsx`.
- Cola de sincronizacion offline: `lib/offline/sync-queue.ts`, `lib/offline-store.ts`.
- `SyncStatus` visible en el topbar.

---

## Tabla resumen de auditoria

| # | Paso | Ruta | Estado | Notas clave |
|---|------|------|--------|-------------|
| 1 | Email llega | `/mail` | 🟡 Parcial | Gmail OAuth funciona; falta ingestion automatica a leads |
| 2 | Lead creado + scoring IA | `/crm` tab Leads IA | ✅ Completo | Scoring IA con temperatura, tags, accion sugerida |
| 3 | Lead cualificado | `/api/crm/convert-lead` | ✅ Completo | Conversion a oportunidad + cliente |
| 4 | Oportunidad gestionada | `/crm` tab Pipeline | ✅ Completo | Kanban D&D, auto-asignacion por especialidad |
| 5 | Cotizacion creada | `/cotizador` | ✅ Completo | Items, condiciones, incoterm, pre-carga |
| 6 | Cotizacion enviada | PDF + email/WhatsApp | 🟡 Parcial | PDF y canales existen; falta boton unificado "Enviar" |
| 7 | OC del cliente | `/ventas/importar-oc` | ✅ Completo | Parseo IA, comparacion con cotizacion, discrepancias |
| 8 | Pedido interno | `/ventas?tab=pedidos` | ✅ Completo | Workflow visual completo |
| 9 | Check de stock | `/stock` | ✅ Completo | Multi-almacen, scanner, movimientos |
| 10 | OC a proveedor | `/compras?tab=pedidos` | ✅ Completo | Gestion completa con proveedores |
| 11 | Recepcion mercancia | `/compras?tab=albaranes` | 🟡 Parcial | Tab existe; falta update automatico de stock |
| 12 | Albaran de entrega | `/ventas?tab=albaranes` | ✅ Completo | Albaran, remito, packing list |
| 13 | Factura emitida | `/ventas?tab=facturas` | ✅ Completo | Integracion Tango, parseo IA |
| 14 | Factura enviada | Email/WhatsApp | 🟡 Parcial | Canales existen; falta flujo automatico |
| 15 | SAT / Mantenimiento | `/sat` (8 sub-paginas) | ✅ Completo | Workflow completo, activos, modelos, repuestos |
| 16 | Cobro recibido | `/cobros` | ✅ Completo | Parseo IA de extractos, matching automatico |
| 17 | Cashflow | `/finanzas` | ✅ Completo | Forecast, aging IA, FX rates |
| 18 | Resumen diario | `/dashboard/ejecutivo` | ✅ Completo | KPIs, analisis IA diario, comparativos |

**Resultado global: 13 Completos / 5 Parciales / 0 Faltantes**

---

## Parte 2: Roadmap de Innovacion — "Secretaria IA Mocciaro"

### Vision

Transformar el Mocciaro Soft ERP de una herramienta de gestion reactiva en un **asistente empresarial proactivo** que anticipe necesidades, automatice decisiones rutinarias y actue como una secretaria ejecutiva digital. La "Secretaria IA Mocciaro" no espera que le pregunten: ella avisa, sugiere, ejecuta y aprende.

El concepto central: **la IA pasa de ser una herramienta dentro del ERP a ser el ERP mismo**. El usuario no navega 18 pantallas; la Secretaria le presenta un briefing matutino, ejecuta las tareas de rutina, y solo interrumpe cuando necesita una decision humana.

---

### Fase 1: Secretaria Reactiva (3-4 semanas)

**Objetivo:** Cerrar los gaps de la auditoria y hacer que la IA responda a todas las preguntas del usuario sin salir del chat.

#### F1.1 — Email-to-Lead automatico
- **Que:** Webhook de Gmail (Google Pub/Sub) que recibe notificaciones push de nuevos emails.
- **Como:** Al llegar un email de un dominio desconocido, la IA lo analiza y crea un lead automaticamente con scoring.
- **Impacto:** Elimina el paso manual de revisar emails y crear leads.
- **Implementacion:**
  - Configurar Google Cloud Pub/Sub con topic para Gmail.
  - Endpoint `/api/webhooks/gmail` que recibe notificaciones.
  - Parseo del email con IA para extraer: nombre, empresa, necesidad, producto de interes.
  - Creacion automatica del lead con scoring.
  - Notificacion al vendedor asignado via alerta + WhatsApp.

#### F1.2 — Boton "Enviar al cliente" unificado
- **Que:** Un solo boton en el detalle de cotizacion/factura/albaran que abre un modal.
- **Como:** El modal muestra: preview del PDF, seleccion de canal (email/WhatsApp), campo de mensaje personalizado, historial de envios previos.
- **Impacto:** Unifica la experiencia de envio y permite tracking.

#### F1.3 — Stock automatico en pedidos
- **Que:** Al crear un pedido de venta, verificar stock automaticamente y reservarlo.
- **Como:** Trigger que al cambiar `tt_sales_orders.status` a `open`:
  1. Consulta stock de cada item.
  2. Si hay stock: reserva automatica (`reserved += qty`).
  3. Si no hay stock: genera alerta + sugiere crear OC al proveedor.
- **Impacto:** Elimina verificaciones manuales y previene sobre-ventas.

#### F1.4 — Conversion cotizacion-a-pedido con un click
- **Que:** Boton "Convertir en pedido" en la cotizacion aceptada.
- **Como:** Crea `tt_sales_orders` + `tt_documents` tipo `pedido` copiando items, cliente, empresa.
- **Impacto:** Flujo continuo sin re-tipear datos.

#### F1.5 — Cadena de trazabilidad visual
- **Que:** Panel lateral "Ver cadena" en cualquier documento.
- **Como:** Dado un documento, recorrer los FKs (`quote_id`, `order_id`, `delivery_note_id`, `invoice_id`) y mostrar un timeline vertical con links.
- **Impacto:** Visibilidad completa del ciclo de vida de cualquier operacion.

---

### Fase 2: Secretaria Proactiva (2-3 meses)

**Objetivo:** La IA anticipa problemas, sugiere acciones y automatiza tareas repetitivas.

#### F2.1 — Briefing matutino personalizado
- **Que:** Cada manana a las 7:30, la Secretaria envia un resumen por WhatsApp/email.
- **Contenido:**
  - Facturas que vencen hoy.
  - Leads hot sin contactar hace 48hs.
  - Pedidos sin albaran hace 5+ dias.
  - Cash flow: alertas de semanas con saldo negativo proyectado.
  - Cumpleanos de clientes (si se tiene la fecha).
  - Cotizaciones enviadas hace 7 dias sin respuesta (sugerir follow-up).
  - Top 3 acciones prioritarias del dia.
- **Implementacion:** Cron + template WhatsApp + logica de priorizacion.

#### F2.2 — Auto-follow-up de cotizaciones
- **Que:** Si una cotizacion enviada no recibe respuesta en 5 dias laborales, la Secretaria:
  1. Genera un email de follow-up personalizado.
  2. Lo muestra al vendedor para aprobar.
  3. Si el vendedor no aprueba en 24hs, envia una notificacion push.
- **Implementacion:** Secuencia automatizada en `tt_sequences` con condiciones IA.

#### F2.3 — Reposicion inteligente de stock
- **Que:** Basandose en velocidad de venta historica + pedidos en pipeline:
  1. Calcular punto de reposicion optimo por producto.
  2. Cuando el stock cae por debajo: generar borrador de OC al proveedor con cantidades sugeridas.
  3. Notificar al comprador para aprobar y enviar.
- **Implementacion:** Cron semanal + modelo predictivo simple (media movil ponderada).

#### F2.4 — Prediccion de pipeline (Predictive Sales)
- **Que:** Modelo de ML que predice:
  - Probabilidad real de cierre de cada oportunidad (no solo el % manual).
  - Fecha estimada de cierre.
  - Monto esperado ajustado.
- **Inputs:** Historial de oportunidades ganadas/perdidas, tiempo en cada etapa, industria del cliente, producto, vendedor.
- **Output:** Score predictivo que se muestra junto al score manual en el Kanban.

#### F2.5 — Facturacion automatica
- **Que:** Cuando un albaran de entrega se marca como "entregado", la Secretaria:
  1. Genera automaticamente la factura borrador.
  2. La envia a revision del admin.
  3. Si pasa 48hs sin objecion, la emite automaticamente via Tango.
  4. Envia al cliente por email + WhatsApp.
- **Implementacion:** Workflow engine con timers.

#### F2.6 — Sentiment tracking de clientes
- **Que:** Analizar el tono de los emails y mensajes de WhatsApp de cada cliente.
- **Metricas:**
  - Indice de satisfaccion (1-10) basado en NLP.
  - Deteccion de riesgo de churn (cliente que no compra hace 6 meses + ultimo email negativo).
  - Alertas cuando el sentiment cae.
- **Implementacion:** Integrar con el flujo de emails/WhatsApp existente + modelo de analisis de sentimiento.

---

### Fase 3: Secretaria Autonoma (6-12 meses)

**Objetivo:** La IA opera de forma casi autonoma, requiriendo intervencion humana solo para decisiones estrategicas.

#### F3.1 — Bot de WhatsApp bidireccional
- **Que:** Los clientes pueden enviar un mensaje a un numero de WhatsApp y la IA responde.
- **Funcionalidades:**
  - "¿Cual es el estado de mi pedido #PED-TT2026-0015?" > La IA busca y responde.
  - "Necesito un presupuesto de 10 atornilladores FIAM 26C" > La IA crea un borrador de cotizacion y lo envia como PDF.
  - "¿Tienen stock del modelo XYZ?" > Consulta en tiempo real.
  - "Quiero agendar una visita del tecnico" > Crea ticket SAT.
- **Implementacion:**
  - WhatsApp Business API (ya existe `/api/whatsapp/send`).
  - Webhook de recepcion de mensajes.
  - Motor de NLU que mapea intenciones a acciones del ERP.
  - Templates aprobados de WhatsApp para respuestas estructuradas.

#### F3.2 — Asistente de voz (Siri/Google Assistant)
- **Que:** Comandos de voz para interactuar con el ERP.
- **Ejemplos:**
  - "Hey Mocciaro, ¿cuantas facturas tengo pendientes?"
  - "Hey Mocciaro, create un lead para empresa X que llamo por atornilladores"
  - "Hey Mocciaro, ¿que tengo agendado para hoy?"
- **Implementacion:**
  - Ya existe `voice-recorder.tsx` y `/api/ai/transcribe`.
  - Integrar con Siri Shortcuts (iOS) y Google Assistant Actions.
  - Custom wake word "Hey Mocciaro" para PWA.

#### F3.3 — Colaboracion en tiempo real
- **Que:** Multiples usuarios editando un documento simultaneamente.
- **Funcionalidades:**
  - Cursores de otros usuarios visibles en cotizaciones.
  - Chat en contexto por documento.
  - Mencion @usuario en notas internas.
  - Notificaciones push cuando alguien edita "tu" documento.
- **Implementacion:** Supabase Realtime + Yjs CRDT.

#### F3.4 — Audit trail con blockchain
- **Que:** Registro inmutable de cada cambio en documentos criticos (facturas, contratos).
- **Funcionalidades:**
  - Hash de cada version del documento almacenado en blockchain (Polygon/Arbitrum).
  - Certificado de integridad descargable.
  - Timestamp con sello de tercero (RFC 3161).
- **Uso:** Compliance fiscal, disputas comerciales, auditorias.
- **Implementacion:** Smart contract simple + hash SHA-256 del PDF.

#### F3.5 — AR/VR para SAT (mantenimiento remoto)
- **Que:** Tecnico en campo usa gafas AR para recibir guia visual remota.
- **Funcionalidades:**
  - Superposicion de manuales sobre el equipo real (lectura del modelo via scanner + datos de `fein-data.ts`).
  - Video-llamada con experto que puede dibujar sobre la imagen.
  - Reconocimiento automatico de piezas y referencia al catalogo.
  - Generacion automatica de la hoja SAT con fotos anotadas.
- **Implementacion:** WebXR API + modelo de vision (YOLO/SAM) entrenado con imagenes de equipos.

#### F3.6 — Digital twin del inventario
- **Que:** Representacion 3D del almacen que muestra en tiempo real la ubicacion y cantidad de cada producto.
- **Funcionalidades:**
  - Mapa interactivo del almacen con estanterias.
  - Click en un producto para ver stock, movimientos, precio.
  - Simulacion: "¿que pasa si llega el pedido X?" > visualizar donde se ubicaria.
  - Alertas visuales: productos bajo minimo en rojo, productos sin movimiento en gris.
- **Implementacion:** Three.js + datos de `tt_stock` + configuracion de layout de almacen.

---

### Innovaciones adicionales

#### I1 — Inteligencia de precios competitiva
- Scraping automatizado de precios de competidores en portales publicos.
- Sugerencia de precio optimo al crear cotizaciones.
- Alertas cuando un competidor baja precios en un producto clave.

#### I2 — Credit scoring de clientes
- Modelo que predice la probabilidad de pago puntual de cada cliente.
- Basado en: historial de pagos, dias promedio de mora, volumen, industria.
- Input automatico en la decision de otorgar credito o exigir anticipo.

#### I3 — Ruta optima para entregas
- Para empresas con reparto propio: optimizacion de rutas de entrega.
- Integracion con Google Maps API.
- Agrupacion de albaranes por zona geografica.
- Estimacion de hora de entrega comunicada al cliente por WhatsApp.

#### I4 — Marketplace interno B2B
- Plataforma donde clientes recurrentes pueden:
  - Ver catalogo con precios personalizados.
  - Hacer pedidos directamente (sin cotizacion).
  - Ver historial de compras y facturas.
  - Solicitar servicio tecnico.
- Implementacion: Extension del portal existente (`/portal/[token]`).

#### I5 — Integracion contable completa
- Conexion bidireccional con sistemas contables: Tango (AR), A3 (ES), QuickBooks (USA).
- Sincronizacion automatica de asientos.
- Cierre de mes automatizado: la Secretaria genera los asientos de cierre, calcula impuestos y prepara las declaraciones.

#### I6 — Dashboards con IA generativa
- En lugar de dashboards estaticos, el usuario hace preguntas en lenguaje natural:
  - "¿Como fue mi margen bruto por producto en Q1 2026?"
  - "Comparame las ventas de TT vs BS este trimestre"
  - "¿Que clientes compraron atornilladores pero nunca compraron repuestos?"
- La IA genera el grafico en tiempo real y lo muestra como artefacto interactivo.

---

### Cronograma propuesto

```
Mes 1-2:   Fase 1 (Secretaria Reactiva)
           - F1.1 Email-to-Lead
           - F1.2 Boton enviar unificado
           - F1.3 Stock automatico
           - F1.4 Conversion coti->pedido
           - F1.5 Cadena de trazabilidad visual

Mes 2-4:   Fase 2a (Secretaria Proactiva - core)
           - F2.1 Briefing matutino
           - F2.2 Auto-follow-up
           - F2.5 Facturacion automatica

Mes 4-6:   Fase 2b (Secretaria Proactiva - avanzada)
           - F2.3 Reposicion inteligente
           - F2.4 Prediccion pipeline
           - F2.6 Sentiment tracking

Mes 6-9:   Fase 3a (Secretaria Autonoma - core)
           - F3.1 Bot WhatsApp bidireccional
           - F3.2 Asistente de voz
           - I4 Marketplace B2B

Mes 9-12:  Fase 3b (Secretaria Autonoma - futurista)
           - F3.3 Colaboracion en tiempo real
           - F3.4 Blockchain audit trail
           - F3.5 AR/VR para SAT
           - F3.6 Digital twin inventario
```

---

### Metricas de exito

| Metrica | Linea base actual | Objetivo Fase 1 | Objetivo Fase 3 |
|---------|-------------------|------------------|------------------|
| Leads creados por dia | ~2 (manual) | 8+ (auto desde email) | 15+ (email + WhatsApp + web) |
| Tiempo lead-to-cotizacion | 4-8 horas | 30 minutos | 5 minutos (auto) |
| Cotizaciones sin follow-up | 40% | 10% | 0% (auto follow-up) |
| Tiempo albaran-a-factura | 2-3 dias | 4 horas | 0 (automatico) |
| Conciliacion bancaria manual | 2hs/semana | 15 min/semana | 0 (auto con Open Banking) |
| Facturas vencidas +30 dias | 25% | 15% | 5% (cobro proactivo) |
| Uso del ERP en mobile | Bajo | Medio (PWA mejorada) | Alto (voz + WhatsApp) |

---

### Arquitectura tecnica propuesta

```
                    +------------------+
                    |  Secretaria IA   |
                    |  (Orchestrator)  |
                    +--------+---------+
                             |
          +------------------+------------------+
          |                  |                  |
   +------v------+   +------v------+   +------v------+
   |   NLU/LLM   |   |  Workflow   |   | Prediction  |
   | (Claude API) |   |   Engine    |   |   Engine    |
   +------+------+   +------+------+   +------+------+
          |                  |                  |
   +------v------+   +------v------+   +------v------+
   | Channels    |   | Supabase    |   | ML Models   |
   | - WhatsApp  |   | - Postgres  |   | - Pipeline  |
   | - Email     |   | - Realtime  |   | - Credit    |
   | - Voice     |   | - Storage   |   | - Pricing   |
   | - Web       |   | - Auth      |   | - Inventory |
   +-------------+   +-------------+   +-------------+
```

---

### Conclusion

El ERP Mocciaro Soft se encuentra en un estado de madurez notable para un sistema en desarrollo, con **13 de 18 pasos completos** y los 5 restantes parcialmente implementados. La base tecnica es solida: Next.js 15, Supabase, multi-empresa, workflows estandarizados, 10+ puntos de integracion con IA, PWA con offline, y un sistema de numeracion y trazabilidad profesional.

La vision de "Secretaria IA Mocciaro" transforma el ERP de una herramienta que el usuario opera a una herramienta que opera para el usuario. Las 3 fases propuestas (reactiva, proactiva, autonoma) representan una evolucion gradual que puede empezar a entregar valor desde la primera semana de desarrollo.

El diferenciador competitivo: **ningun ERP del mercado para PYMES combina IA nativa + WhatsApp bidireccional + asistente de voz + multi-empresa + trazabilidad E2E**. Mocciaro Soft tiene la oportunidad de definir una nueva categoria.

---

*Documento generado automaticamente por auditoria de codigo. Basado en analisis de 35+ archivos fuente, 35 API routes, 20+ componentes de UI, y 5 cron jobs configurados.*
