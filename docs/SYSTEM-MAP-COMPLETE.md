# Mocciaro Soft ERP — Mapa completo del sistema

**Fecha:** Abril 2026 | **Para:** contexto de IA (Copilot / Claude / Gemini)
**Repo:** `mocciaro-soft/` | **Produccion:** Vercel + Supabase

---

## 1. VISION GENERAL

### Que es
Mocciaro Soft es un ERP/CRM web full-stack que gestiona la operacion comercial completa de un grupo de empresas dedicadas a la venta de herramientas industriales de apriete (torquimetros, atornilladores electricos, llaves hidraulicas, equipos de soldadura por puntos, etc.). Cubre desde la captura de leads hasta el cobro de facturas, pasando por cotizaciones, pedidos, despacho, servicio tecnico (SAT) y conciliacion bancaria.

### Para quien
- **Juan Manuel Mocciaro** (super admin, CEO)
- **Facundo, Norberto, Jano** (vendedores TorqueTools SL)
- Expansion prevista a mas usuarios y empresas

### Las 4 empresas del grupo

| Prefijo | Nombre | Pais | Moneda | CUIT/NIF/EIN | Rol |
|---------|--------|------|--------|--------------|-----|
| `TT` | TorqueTools SL | Espana (ES) | EUR | B12345678 | Vendedora principal Europa |
| `BS` | Buscatools SA / Mocciaro Juan Manuel Jesus | Argentina (AR) | ARS | 20-27089205-2 | Importadora/distribuidora AR |
| `TQ` | Torquear SA | Argentina (AR) | ARS | 33-71159029-9 | Distribuidora industrial AR |
| `GA` | Global Assembly Solutions LLC | USA (US) | USD | 12-3456789 | Operaciones USA |

### Relaciones intercompany
- BS compra a TT (EUR, EXW)
- BS compra a GA (USD, EXW)
- TQ compra a TT (EUR, EXW)
- TQ compra a GA (USD, EXW)

### Regla de oro: Multi-empresa del topbar
El selector "Multi-empresa" del topbar es la fuente unica de verdad. **Ningún listado, dropdown, filtro o KPI** muestra datos fuera de las empresas seleccionadas. Se usa `useCompanyContext().visibleCompanies` — **NUNCA** la lista completa `companies`.

### Regla fundamental: Barra de proceso sticky
Toda pantalla de documento (cotizacion, pedido, albaran, factura, OC, lead, SAT, etc.) DEBE incluir `<DocumentProcessBar>` arriba con: codigo del documento, badge de estado, info contextual, alertas del paso actual, stepper visual, y acciones principales.

---

## 2. ARQUITECTURA TECNICA

### Stack principal
| Capa | Tecnologia | Version |
|------|-----------|---------|
| Frontend | Next.js + React + TypeScript | Next.js 16.2.3, React 19.2.4 |
| CSS | Tailwind CSS v4 | Con tailwind-merge |
| Iconos | Lucide React | v1.8.0 |
| Graficos | Recharts | v3.8.1 |
| Tablas / Hojas | SheetJS (xlsx) | v0.18.5 |
| Backend | Next.js API Routes (Node.js) | Runtime nodejs |
| Base de datos | Supabase (PostgreSQL) | Con Storage, Auth, RLS |
| Auth | Supabase Auth + Google OAuth | JWT, session cookies |
| Deploy | Vercel | Con cron jobs |
| PDF | pdf-lib | v1.17.1 (dev) |
| Fechas | date-fns | v4.1.0 |
| Google APIs | googleapis | v171.4.0 (Gmail, Calendar) |

### Inteligencia Artificial
| Proveedor | Modelo | Uso principal |
|-----------|--------|--------------|
| Google | Gemini 2.0 Flash | Lead scoring, OCR recibos, parseo OC/extractos, resumen diario (default para queries rapidos) |
| Anthropic | Claude Sonnet 4 | Asistente chat, analisis complejos, fallback de Gemini |

### APIs externas integradas
| API | Uso |
|-----|-----|
| StelOrder | Migracion de datos historicos (clientes, productos, pedidos, albaranes, facturas) |
| Tango Factura | Facturacion electronica AFIP (empresas argentinas) |
| Gmail API | Lectura de emails, creacion de leads automaticos, envio de cotizaciones/facturas |
| WhatsApp Business | Envio de mensajes a clientes (notificaciones, seguimientos) |
| DolarAPI.com | Cotizacion dolar blue/oficial (Argentina) |
| ECB (Banco Central Europeo) | Tipos de cambio EUR/USD/etc. |

### Supabase Storage (buckets)
| Bucket | Contenido |
|--------|-----------|
| `invoices` | PDFs de facturas (20MB max, PDF/PNG/JPEG) |
| `bank-statements` | Extractos bancarios (PDF/PNG/JPEG/CSV) |
| `client-pos` | Ordenes de compra de clientes (PDF/PNG/JPEG) |
| `stelorder-pdfs` | PDFs migrados de StelOrder (50MB max) |

---

## 3. BASE DE DATOS — TODAS LAS TABLAS

Prefijo: `tt_` en todas las tablas. RLS habilitado en todas. Politicas actuales: `FOR ALL TO authenticated USING (true)` (permisivo — se refinara).

### 3.1 Core (empresas, usuarios, roles)

#### `tt_companies`
Empresas del grupo. Columnas clave: `id`, `name`, `legal_name`, `tax_id`, `tax_id_type`, `country`, `currency`, `code_prefix` (2 letras: TT/BS/TQ/GA), `company_type`, `parent_company_id`, `brand_color`, `secondary_color`, `logo_url`, `default_tax_rate`, `default_margin`, `invoice_prefix`, `whatsapp_phone_id`, `whatsapp_token`, `whatsapp_enabled`, `migrated_from_stelorder`, `migration_stats`.

#### `tt_users`
Usuarios del sistema (extiende auth.users). Columnas clave: `id`, `auth_id` (FK a auth.users), `email`, `full_name`, `short_name`, `role` (admin/vendedor/viewer), `phone`, `whatsapp`, `default_company_id`, `permissions` (JSONB), `gmail_connected`.

#### `tt_user_companies`
Tabla pivote usuario-empresa (N:M). Columnas: `user_id`, `company_id`, `is_default`, `can_sell`, `can_buy`.

#### `tt_roles`, `tt_permissions`, `tt_role_permissions`, `tt_user_roles`
Sistema RBAC completo. Roles como `super_admin`, `vendedor`, `viewer`. Permisos granulares como `view_crm`, `create_quote`, `edit_quote`, `approve_order`, `create_invoice`, `view_financials`, `admin_users`, etc.

#### `tt_user_teams`, `tt_teams`
Equipos de trabajo para asignacion de tareas.

#### `tt_intercompany_relations`
Relaciones intercompany (buyer/seller). Columnas: `buyer_company_id`, `seller_company_id`, `default_currency`, `default_incoterm`.

#### `tt_system_params`
Parametros clave-valor del sistema (`default_currency`, `quote_validity_days`, `default_tax_rate`, etc.).

### 3.2 CRM (leads, oportunidades, interacciones)

#### `tt_leads`
Leads del CRM con scoring IA. Columnas clave: `code` (LEAD-TT2026-0001), `company_id`, `name`, `email`, `phone`, `source` (web_form/whatsapp/email/llamada/referido), `company_name`, `estimated_value`, `currency`, `status` (new/contacted/qualified/proposal_sent/negotiation/won/lost/nurturing), `assigned_to`, `raw_message`, `ai_score` (0-100), `ai_temperature` (hot/warm/cold), `ai_tags`, `ai_suggested_action`, `ai_suggested_email`, `ai_needs` (JSONB), `converted_client_id`, `converted_quote_id`, `converted_opportunity_id`, `converted_at`, `stelorder_id`.

#### `tt_lead_interactions`
Timeline de interacciones con leads. Columnas: `lead_id`, `type` (email/call/meeting/whatsapp/note), `direction` (inbound/outbound), `subject`, `body`, `ai_summary`, `ai_next_steps`, `attachments`, `created_by`.

#### `tt_opportunities`
Pipeline de oportunidades. Columnas clave: `code` (OPP-TT2026-0001), `title`, `client_id`, `company_id`, `assigned_to`, `stage` (lead/propuesta/negociacion/ganado/perdido), `value`, `currency`, `probability` (0-100), `expected_close_date`, `source`, `quote_id`, `source_lead_id`, `ai_score`, `ai_temperature`, `ai_tags`, `ai_suggested_action`.

### 3.3 Ventas (documentos, items, links)

#### `tt_documents`
**Tabla maestra de todos los documentos comerciales.** Columnas clave: `id`, `type` (cotizacion/pedido/albaran/remito/packing_list/factura/nota_credito/nota_debito/recibo/gasto/orden_compra/factura_compra/albaran_compra), `subtype`, `system_code` (COT-TT2026-0004), `display_ref`, `legal_number`, `company_id`, `client_id`, `user_id`, `assigned_to`, `status`, `currency`, `exchange_rate`, `subtotal`, `tax_rate`, `tax_amount`, `total`, `incoterm`, `payment_terms`, `payment_days`, `delivery_address`, `delivery_date`, `valid_until`, `notes`, `internal_notes`, `metadata` (JSONB), `process_instance_id`, `invoice_method` (tango_api/manual_upload/external), `provider_id`, `original_pdf_url`, `preview_pdf_url`, `extracted_data`, `cae`, `cae_expires`, `tango_invoice_id`, `tango_movimiento_id`, `invoice_number`, `invoice_date`, `invoice_total`, `invoice_currency`, `ocr_image_url`, `ocr_extracted_data`, `stelorder_id`, `stelorder_reference`, `client_po_reference`, `is_packing_list`.

#### `tt_document_items`
Items de documentos. Columnas: `document_id`, `product_id`, `sku`, `description`, `quantity`, `unit_price`, `unit_cost`, `discount_pct`, `subtotal`, `qty_reserved`, `qty_delivered`, `qty_invoiced`, `qty_received`, `qty_cancelled`, `requires_po`, `po_status`, `po_document_id`, `warehouse_id`.

#### `tt_document_item_components`
Desglose interno de items (componentes de kit). `parent_item_id`, `product_id`, `quantity`.

#### `tt_document_links`
Relaciones entre documentos (cotizacion -> pedido -> albaran -> factura). `parent_id`, `child_id`, `relation_type`, `item_mapping`, `fulfillment_pct`.

#### `tt_quotes`
Cotizaciones (tabla legacy, coexiste con tt_documents). Columnas: `quote_number` (auto: COT-TT2026-0001), `company_id`, `client_id`, `client_contact_id`, `status` (borrador/enviada/aceptada/rechazada/expirada/facturada), `currency`, `subtotal`, `tax_rate`, `tax_amount`, `total`, `incoterm`, `payment_terms`, `payment_terms_type`, `validity_days`, `stelorder_id`.

#### `tt_quote_items`
Items de cotizacion. `quote_id`, `product_id`, `sku`, `description`, `quantity`, `unit_price`, `discount_percent`, `subtotal`.

#### `tt_sales_orders`
Pedidos de venta. `so_number` (auto: PED-TT2026-0001), `company_id`, `client_id`, `quote_id`, `status` (borrador/confirmado/en_preparacion/enviado/entregado/facturado/cancelado), `payment_terms`, `payment_days`, `stelorder_id`.

#### `tt_so_items`
Items de pedidos de venta. `so_id`, `product_id`, `quantity`, `shipped_quantity`, `unit_price`.

### 3.4 Compras (OC, proveedores)

#### `tt_purchase_orders`
Ordenes de compra. `po_number` (auto: OC-TT2026-0001), `company_id`, `supplier_name`, `supplier_email`, `status` (borrador/enviada/confirmada/recibida_parcial/recibida/cancelada), `stelorder_id`.

#### `tt_po_items`
Items de OC. `po_id`, `product_id`, `quantity`, `received_quantity`, `unit_price`.

#### `tt_suppliers`
Proveedores (creada en migration v4+). Columnas extendidas: `stelorder_id`, `ai_score`, `ai_tags`, `ai_analysis`, `ai_profile` (JSONB: delivery_score, quality_score, price_score, reliability_score, avg_delivery_days, etc.), `portal_token`, `portal_token_expires_at`, `is_duplicate_of`, `bank_account_id`, `supplier_family`.

#### `tt_supplier_interactions`
Timeline de interacciones con proveedores. `supplier_id`, `company_id`, `type` (email_sent/email_received/call/meeting/complaint/quality_issue/price_negotiation/delivery_issue/payment_sent/note/other), `direction`, `subject`, `body`, `outcome`, `rating` (1-5).

#### `tt_supplier_portal_tokens`
Tokens de acceso al portal de proveedores. `supplier_id`, `company_id`, `token` (hex aleatorio), `is_active`, `expires_at`.

#### `tt_oc_parsed`
OC de clientes parseadas por IA. `document_id`, `file_url`, `raw_text`, `parsed_items`, `confidence_score`, `status`, `ai_provider`, `ai_discrepancies`, `ai_summary`, `matched_quote_id`.

### 3.5 Productos

#### `tt_products`
Catalogo de productos. Columnas: `sku`, `name`, `brand`, `category_id`, `price_cost`, `price_list`, `price_currency`, `weight_kg`, `hs_code`, `origin_country`, `specs` (JSONB), `is_kit`, `unit_of_measure`, `search_tokens` (GIN index para busqueda rapida), `stelorder_id`, `tango_producto_codigo`.

#### `tt_product_categories`
Categorias jerarquicas de productos. `name`, `slug`, `parent_id`, `sort_order`. Categorias seed: Herramientas Electricas, Neumaticas, Torquimetros, Soldadura por Puntos, Taladros, Atornilladores, Amoladoras, Accesorios, Repuestos.

#### `tt_kit_components`
Componentes de kits. `kit_product_id`, `component_product_id`, `quantity`, `sort_order`.

### 3.6 Stock

#### `tt_stock`
Stock por producto y almacen. `product_id`, `warehouse_id` (UNIQUE pair), `quantity`, `reserved`, `min_stock`, `max_stock`, `last_counted_at`.

#### `tt_warehouses`
Almacenes. `name`, `code` (BCN/BUE/HOU), `city`, `country`, `company_id`, `stelorder_id`.

#### `tt_stock_movements`
Movimientos de stock. `product_id`, `warehouse_id`, `movement_type`, `quantity`, `document_id`, `origin_warehouse_id`, `destination_warehouse_id`.

### 3.7 Clientes

#### `tt_clients`
Clientes. `code`, `company_name`, `legal_name`, `tax_id`, `type` (empresa/autonomo/particular/distribuidor), `country`, `payment_terms`, `credit_limit`, `currency`, `assigned_to`, `tags`, `total_revenue`, `ai_profile` (JSONB: segment, lifetime_value, avg_payment_days), `tango_cliente_codigo`, `tango_cliente_id`, `stelorder_id`, `billing_address_id`, `shipping_address_id`, `risk_limit`.

#### `tt_client_contacts`
Contactos de clientes. `client_id`, `full_name`, `position`, `email`, `phone`, `whatsapp`, `is_primary`, `stelorder_id`.

#### `tt_addresses`
Direcciones normalizadas reutilizables. `line1`, `line2`, `city`, `state`, `postal_code`, `country_code`, `latitude`, `longitude`, `label` (billing/shipping/warehouse/office), `entity_type`, `entity_id`.

### 3.8 Facturacion

#### `tt_invoice_providers`
Proveedores de facturacion por empresa. `company_id`, `provider_type` (tango_api/manual_upload/external), `name`, `is_default`, `config` (JSONB: credenciales Tango, etc.).

#### `tt_tango_maestros_cache`
Cache de datos maestros de Tango. PK: `(company_id, tipo)`. Tipos: alicuotas, monedas, puntos_venta, perfiles, categorias_impositivas, tipos_documento.

### 3.9 Finanzas (FX, cashflow, bancos)

#### `tt_fx_rates`
Tipos de cambio diarios. `date`, `base_currency`, `target_currency`, `rate`, `source` (dolarapi.com/ecb/manual). UNIQUE por (date, base, target).

#### `tt_cashflow_snapshots`
Snapshots de forecast para historial. `company_id`, `snapshot_date`, `horizon_days` (30/60/90), `currency`, `inflow_invoices_pending`, `outflow_purchases`, `net_cashflow`, `projected_closing`, `ai_summary`.

#### `tt_bank_statements`
Extractos bancarios. `company_id`, `bank_name`, `account_number`, `currency`, `period_from`, `period_to`, `opening_balance`, `closing_balance`, `original_pdf_url`, `parsed_by` (gemini/claude/manual), `status` (pending/parsed/reconciled/archived).

#### `tt_bank_statement_lines`
Lineas del extracto. `statement_id`, `date`, `description`, `reference`, `amount` (+credito/-debito), `type` (credit/debit/fee/interest/other), `matched_document_id`, `matched_client_id`, `match_confidence` (0-1), `match_method` (amount_exact/cuit_match/reference_match/ai_suggested), `match_status` (unmatched/suggested/confirmed/rejected/ignored).

#### `tt_bank_accounts`
Cuentas bancarias de cualquier entidad. `owner_name`, `iban`, `swift_bic`, `entity_type`, `entity_id`.

### 3.10 SAT (Servicio Tecnico)

#### `tt_sat_tickets`
Tickets de servicio. `ticket_number`, `client_id`, `company_id`, `assigned_to`, `product_id`, `serial_number`, `type` (reparacion/mantenimiento/garantia/instalacion/calibracion), `priority` (baja/normal/alta/urgente), `status` (abierto/en_proceso/esperando_repuesto/resuelto/cerrado), `title`, `description`, `resolution`, `estimated_hours`, `actual_hours`, `cost`, `stelorder_id`.

Nota: tablas adicionales del SAT (tt_sat_assets, tt_fein_models, tt_sat_spare_parts, etc.) se crean en migrations v6, v11, v12, v13.

### 3.11 Alertas e IA

#### `tt_alert_settings`
Configuracion de alertas por empresa/usuario. `company_id`, `user_id`, `invoice_due_days` (array: [7,3,1,0]), `quote_expiry_days`, `lead_cold_days`, `stock_min_enabled`, `daily_digest_enabled`, `daily_digest_hour`, `email_enabled`, `whatsapp_enabled`.

#### `tt_generated_alerts`
Alertas generadas (con deduplicacion). `company_id`, `type` (invoice_due/quote_expiry/lead_cold/stock_low/daily_digest), `entity_type`, `entity_id`, `title`, `body`, `severity` (info/warning/danger/success), `sent_email`, `sent_whatsapp`, `dedup_key`.

#### `tt_digest_log`
Log de resumenes diarios enviados. `company_id`, `user_id`, `digest_date`, `stats` (JSONB), `email_sent`.

#### `tt_agent_tasks`
Tareas del agente autonomo IA. `company_id`, `task_description`, `status` (pending/planning/executing/completed/failed), `plan` (JSONB), `actions` (JSONB), `summary`, `ai_provider`, `created_by`.

#### `tt_ai_summaries`
Resumenes ejecutivos diarios generados por IA. `company_id`, `date` (UNIQUE por empresa/dia), `summary`, `highlights`, `actions`, `concerns`, `raw_data`, `ai_provider`.

### 3.12 CRM Scale (email sequences, forms, portal)

#### `tt_email_sequences`
Secuencias de email automaticas. `company_id`, `name`, `trigger_type` (lead_new/lead_qualified/quote_sent/quote_accepted/order_created/invoice_sent/manual), `steps` (JSONB), `is_active`.

#### `tt_email_enrollments`
Inscripciones en secuencias. `sequence_id`, `entity_type`, `entity_id`, `email`, `current_step`, `status` (active/paused/completed/unsubscribed/failed), `next_send_at`.

#### `tt_email_log`
Log de emails enviados. `enrollment_id`, `company_id`, `to_email`, `subject`, `body`, `channel`, `status`, `opened_at`, `clicked_at`, `supplier_id`.

#### `tt_public_forms`
Formularios publicos (captura de leads). `company_id`, `name`, `slug` (UNIQUE), `fields` (JSONB), `redirect_url`, `auto_score` (boolean), `auto_sequence_id`, `is_active`, `submissions_count`, `theme` (JSONB). Accesible por `anon`.

#### `tt_client_portal_tokens`
Portal de cliente (acceso sin auth). `client_id`, `company_id`, `token`, `email`, `expires_at`, `is_active`.

### 3.13 Process Engine

#### `tt_process_stage_definitions`
Templates de etapas por tipo de proceso. Tipos: `LEAD_TO_CASH` (10 etapas), `PURCHASE_TO_PAY` (10 etapas), `IMPORT_OPERATION` (9 etapas), `MAINTENANCE_FLOW` (8 etapas).

#### `tt_process_instances`
Instancias de procesos vivos. `process_type`, `name`, `customer_id`, `supplier_id`, `company_id`, `origin_document_id`, `current_stage_code`, `current_status` (active/paused/completed/cancelled/blocked), `progress_percent` (0-100), `color_code` (computed: verde/amarillo/rojo/azul), `assigned_to_user_id`.

#### `tt_process_stages`
Etapas reales de cada proceso. `process_instance_id`, `stage_definition_id`, `status` (pending/in_progress/completed/skipped/blocked), `started_at`, `completed_at`, `due_date`, `document_id`, `stage_data` (JSONB).

#### `tt_process_documents`
Links proceso-documento (N:M). `process_instance_id`, `document_id`, `stage_code`, `role` (origin/quote/order/delivery/invoice/payment/related).

### 3.14 Chat y Auditoria

#### `tt_threads`
Hilos de chat internos (adjuntos a cualquier entidad). `entity_type` (process_instance/document/customer/supplier/product/sat_ticket), `entity_id`, `title`, `is_resolved`.

#### `tt_messages`
Mensajes en hilos. `thread_id`, `author_user_id`, `content`, `is_internal`, `is_system`, `attachments` (JSONB), `mentions` (JSONB), `is_hidden`.

#### `tt_audit_log`
Auditoria enriquecida. `entity_type`, `entity_id`, `action`, `changed_by_user_id`, `old_values` (JSONB), `new_values` (JSONB), `description`.

#### `tt_activity_log`
Auditoria legacy. `user_id`, `entity_type`, `entity_id`, `action`, `description`, `metadata`.

### 3.15 Migracion

#### `tt_migration_log`
Log de migracion desde StelOrder. `source`, `company_id`, `phase`, `entity`, `status` (running/completed/failed/partial), `total_source`, `processed`, `inserted`, `updated`, `skipped`, `errors`, `error_log`, `last_cursor`.

#### `tt_document_sequences`
Secuencias de numeracion por empresa+tipo+anio. PK: `(company_id, doc_type, year)`. `last_number`. Funcion SQL `next_document_code()` genera codigos como `COT-TT2026-0004`.

### 3.16 Notificaciones, Mail, Misc

#### `tt_notifications`
Notificaciones in-app. `user_id`, `title`, `message`, `type` (info/success/warning/error), `link`, `is_read`.

#### `tt_mail_followups`
Seguimientos de email (Gmail). `user_id`, `client_id`, `subject`, `gmail_thread_id`, `gmail_message_id`, `status` (pendiente/seguimiento/respondido/archivado), `follow_up_date`.

---

## 4. API ROUTES — TODOS LOS ENDPOINTS

### Auth
| Metodo | Path | Descripcion |
|--------|------|-------------|
| GET | `/api/auth/google` | Inicia flujo OAuth2 con Google (Gmail) |
| GET | `/api/auth/google/callback` | Callback de Google OAuth2, guarda tokens |

### Admin
| Metodo | Path | Descripcion |
|--------|------|-------------|
| GET/POST | `/api/admin/users` | CRUD de usuarios del sistema |

### IA
| Metodo | Path | Descripcion |
|--------|------|-------------|
| POST | `/api/ai/agent` | Ejecuta agente autonomo IA (planifica + ejecuta tareas) |
| POST | `/api/ai/daily-summary` | Genera resumen ejecutivo diario con IA |
| POST | `/api/ai/execute` | Ejecuta accion IA generica (chat, analisis) |
| POST | `/api/ai/ocr-receipt` | OCR de recibos/gastos con Gemini Vision |
| POST | `/api/ai/transcribe` | Transcripcion de voz para SAT (diagnosticos hablados) |

### Asistente
| Metodo | Path | Descripcion |
|--------|------|-------------|
| POST | `/api/assistant/chat` | Chat flotante del asistente IA (contexto empresa) |

### Conciliacion bancaria
| Metodo | Path | Descripcion |
|--------|------|-------------|
| POST | `/api/bank-statements/parse` | Parsea extracto bancario PDF con IA |
| POST | `/api/bank-statements/confirm-match` | Confirma/rechaza match de linea bancaria |

### Cash Flow
| Metodo | Path | Descripcion |
|--------|------|-------------|
| GET | `/api/cashflow/aging` | Aging report (facturas vencidas/por vencer) |
| GET | `/api/cashflow/forecast` | Forecast de cashflow a 30/60/90 dias |

### CRM
| Metodo | Path | Descripcion |
|--------|------|-------------|
| POST | `/api/crm/convert-lead` | Convierte lead a oportunidad + (opcionalmente) cliente + cotizacion |
| POST | `/api/leads/score` | Scoring IA de leads (calcula ai_score, ai_temperature, ai_tags) |

### Cron Jobs
| Metodo | Path | Descripcion |
|--------|------|-------------|
| POST/GET | `/api/cron/alerts` | Genera alertas para todas las empresas |
| POST/GET | `/api/cron/daily-digest` | Envia resumen diario por email |
| GET | `/api/cron/check-emails` | Revisa Gmail y crea leads de emails desconocidos |

### Documentos
| Metodo | Path | Descripcion |
|--------|------|-------------|
| GET | `/api/documents/[id]/render` | Renderiza PDF de documento |
| POST | `/api/documents/[id]/send` | Envia documento por email al cliente |
| POST | `/api/documents/convert` | Convierte documento (cotizacion->pedido, pedido->albaran, etc.) |

### Formularios publicos
| Metodo | Path | Descripcion |
|--------|------|-------------|
| GET | `/api/forms/[slug]` | Obtiene config de formulario publico |
| POST | `/api/forms/[slug]/submit` | Recibe submission y crea lead |

### Tipos de cambio
| Metodo | Path | Descripcion |
|--------|------|-------------|
| GET | `/api/fx/rates` | Obtiene/actualiza tipos de cambio (DolarAPI + ECB) |

### Health
| Metodo | Path | Descripcion |
|--------|------|-------------|
| GET | `/api/health/sales-chain` | Verifica integridad de cadena de ventas (cot->ped->alb->fac) |

### Facturacion
| Metodo | Path | Descripcion |
|--------|------|-------------|
| POST | `/api/invoices/parse` | Parsea factura PDF con IA |
| GET | `/api/invoices/tango/config` | Obtiene config Tango de empresa |
| POST | `/api/invoices/tango/emit` | Emite factura via API Tango (AFIP) |
| POST | `/api/invoices/tango/sync-remitos` | Sincroniza remitos de Tango |

### Migracion
| Metodo | Path | Descripcion |
|--------|------|-------------|
| POST | `/api/migration/stelorder` | Ejecuta migracion desde StelOrder |

### OC de clientes
| Metodo | Path | Descripcion |
|--------|------|-------------|
| POST | `/api/oc/parse` | Parsea OC de cliente (PDF) con IA y la matchea contra cotizacion |

### Portal
| Metodo | Path | Descripcion |
|--------|------|-------------|
| GET | `/api/portal/[token]` | Portal de cliente (ver documentos sin auth) |
| GET | `/api/portal/supplier/[token]` | Portal de proveedor (ver OC, confirmar) |

### Procesos
| Metodo | Path | Descripcion |
|--------|------|-------------|
| GET/POST | `/api/processes` | CRUD de instancias de procesos |
| GET/PATCH | `/api/processes/[id]` | Detalle/avance de proceso especifico |

### Productos
| Metodo | Path | Descripcion |
|--------|------|-------------|
| POST | `/api/products/scan` | Escanea codigo de barras y busca producto |

### Secuencias email
| Metodo | Path | Descripcion |
|--------|------|-------------|
| POST | `/api/sequences/process` | Procesa cola de emails pendientes de secuencias |

### Stock
| Metodo | Path | Descripcion |
|--------|------|-------------|
| POST | `/api/stock/check-availability` | Verifica disponibilidad de stock para items |

### Proveedores
| Metodo | Path | Descripcion |
|--------|------|-------------|
| POST | `/api/suppliers/score` | Scoring IA de proveedores |

### Threads (chat)
| Metodo | Path | Descripcion |
|--------|------|-------------|
| GET/POST | `/api/threads` | CRUD de hilos y mensajes internos |

### Webhooks
| Metodo | Path | Descripcion |
|--------|------|-------------|
| POST | `/api/webhooks/gmail` | Recibe notificaciones de Gmail y crea leads |

### WhatsApp
| Metodo | Path | Descripcion |
|--------|------|-------------|
| POST | `/api/whatsapp/send` | Envia mensaje WhatsApp Business |

### Debug
| Metodo | Path | Descripcion |
|--------|------|-------------|
| GET | `/api/debug-env` | Verifica variables de entorno (solo dev) |

---

## 5. PAGINAS Y MODULOS

### Navegacion principal (sidebar)

| # | Label | URL | Descripcion | Workflow |
|---|-------|-----|-------------|----------|
| 1 | Dashboard | `/dashboard` | KPIs principales, graficos de venta, pipeline CRM, cobros | - |
| 2 | Dashboard ejecutivo | `/dashboard/ejecutivo` | Resumen IA diario, agente autonomo, alertas criticas | - |
| 3 | Hub IA | `/ai-hub` | Centro de control IA: agent panel, voice chat, resumen diario, OCR | - |
| 4 | CRM | `/crm` | Leads IA + Pipeline (Kanban) + Actividades + Informes CRM | lead, opportunity |
| 5 | Cotizador | `/cotizador` | Crear/editar cotizaciones, items, condiciones, enviar a cliente | quote |
| 6 | Pedidos | `/ventas?tab=pedidos` | Lista pedidos de venta, workflow de preparacion | sales_order |
| 7 | Importar OC | `/ventas/importar-oc` | Subir OC de cliente (PDF), parsear con IA, matchear vs cotizacion | client_po |
| 8 | Albaranes | `/ventas?tab=albaranes` | Albaranes/remitos, entrega parcial/total | delivery_note |
| 9 | Facturas | `/ventas?tab=facturas` | Facturacion multi-proveedor (Tango/manual/externa) | invoice |
| 10 | Cobros | `/cobros` | Registro de cobros, conciliacion con facturas | - |
| 11 | Finanzas | `/finanzas` | Cash flow, aging report, forecast IA, FX rates | bank_statement |
| 12 | Compras | `/compras?tab=pedidos` | Ordenes de compra a proveedores | purchase_order |
| 13 | Stock | `/stock` | Niveles de stock por almacen, movimientos, alertas minimo | - |
| 14 | Proveedores | `/compras?tab=proveedores` | Listado de proveedores, scoring IA, portal | - |
| 15 | Clientes | `/clientes` | Ficha de cliente, contactos, historial, merge, sync | - |
| 16 | Catalogo | `/catalogo` | Catalogo de productos, categorias, kits, busqueda | - |
| 17 | SAT | `/sat` | Tickets de servicio tecnico, workflow 5 etapas | sat_ticket |
| 18 | Gastos | `/gastos` | Registro de gastos, OCR de recibos | - |
| 19 | Agente IA | `/dashboard/ejecutivo` | Alias al dashboard ejecutivo con foco en agente | - |
| 20 | Informes | `/informes` | Reportes de venta, facturacion, CRM, stock | - |
| 21 | Admin | `/admin` | Gestion de usuarios, roles, permisos, config empresas | - |

### Sub-paginas SAT (cuando se navega a `/sat/*`)
| Sub | URL | Descripcion |
|-----|-----|-------------|
| Activos | `/sat/activos` | Activos registrados de clientes (maquinas con serial) |
| Hojas | `/sat/hojas` | Hojas de servicio (diagnostico + fotos + resolucion) |
| Repuestos | `/sat/repuestos` | Catalogo de repuestos de SAT |
| Modelos | `/sat/modelos` | Modelos Fein y compatibilidades |
| Manuales | `/sat/manuales` | Documentacion tecnica y manuales |
| Lotes | `/sat/lotes` | Lotes de reparacion agrupados |
| Pausadas | `/sat/pausadas` | Tickets en espera de repuestos |
| Historico | `/sat/historico` | Historial completo de servicios |

### Otras paginas
| URL | Descripcion |
|-----|-------------|
| `/login` | Login con Supabase Auth |
| `/calendario` | Vista de calendario |
| `/mail` | Bandeja de email integrada (Gmail) |
| `/scanner` | Scanner de codigos de barras (PWA) |
| `/forms/[slug]` | Formulario publico de captura de leads |
| `/portal/[token]` | Portal de cliente (sin auth) |

---

## 6. FLUJOS DE NEGOCIO

### 6.1 Flujo de venta completo (Lead -> Cobro)

```
Lead (captura) -> Scoring IA (auto) -> Cualificacion (vendedor)
  -> Oportunidad (pipeline Kanban)
    -> Cotizacion (items + condiciones + incoterm + pago)
      -> Envio al cliente (email/WhatsApp)
        -> OC del cliente (upload PDF, parseo IA, matcheo)
          -> Pedido de venta (confirmado)
            -> Albaran/Remito (despacho parcial/total)
              -> Factura (Tango API / manual / externa)
                -> Cobro (conciliacion bancaria)
```

Cada paso genera un `tt_documents` vinculado al anterior via `tt_document_links`. El process engine (`LEAD_TO_CASH`, 10 etapas) trackea el progreso con color-code (verde/amarillo/rojo).

### 6.2 Flujo de compra completo (Necesidad -> Pago)

```
Necesidad detectada (stock bajo / pedido cliente)
  -> OC a proveedor (borrador -> enviada)
    -> Confirmacion proveedor (via portal o email)
      -> Transito (tracking)
        -> Recepcion en almacen (parcial/total, actualiza stock)
          -> Factura de compra (upload PDF, parseo IA)
            -> Programacion de pago
              -> Pago realizado
```

Process engine: `PURCHASE_TO_PAY` (10 etapas).

### 6.3 Flujo SAT (Recepcion -> Cierre)

```
Recepcion equipo (ticket abierto)
  -> Diagnostico (fotos, voice-to-text, formulario inspeccion)
    -> Cotizacion de reparacion (items repuestos + mano de obra)
      -> Aprobacion cliente
        -> Reparacion (registro horas, repuestos usados)
          -> Control de torque (mediciones)
            -> Cierre (PDF servicio, entrega equipo)
```

Process engine: `MAINTENANCE_FLOW` (8 etapas). Workflow en `workflow-definitions.ts`: `sat_ticket` (5 pasos: diagnostico -> cotizacion -> reparacion -> torque -> cierre).

### 6.4 Flujo de facturacion (por pais)

| Pais | Metodo | Flujo |
|------|--------|-------|
| Argentina (BS, TQ) | `tango_api` | Datos del documento -> API Tango Factura -> AFIP autoriza -> CAE asignado -> PDF generado |
| Argentina (alt) | `manual_upload` | Facturar externo -> Upload PDF -> IA parsea datos (CAE, total, items) -> Registrar |
| Espana (TT) | `external` | Facturar en sistema externo (StelOrder / contabilidad) -> Marcar como facturado en ERP |
| USA (GA) | `external` | Idem Espana |

Configuracion por empresa en `tt_invoice_providers`.

### 6.5 Flujo de conciliacion bancaria

```
Upload extracto bancario (PDF/CSV)
  -> Parseo con IA (Gemini: extrae lineas, fechas, montos)
    -> Auto-match (por monto exacto, CUIT, referencia)
      -> Revision manual (confirmar/rechazar matches sugeridos)
        -> Conciliado (todas las lineas matcheadas)
```

Workflow en `workflow-definitions.ts`: `bank_statement` (5 pasos: uploaded -> parsed -> auto_match -> review -> reconciled).

### 6.6 Flujo CRM (Lead -> Oportunidad -> Cotizacion)

```
Captura de lead:
  - Formulario publico (/forms/[slug])
  - Email entrante (cron check-emails cada 15 min)
  - WhatsApp entrante
  - Manual

  -> Scoring IA automatico (POST /api/leads/score)
    -> Clasificacion: hot (>70) / warm (40-70) / cold (<40)
      -> Tags IA: ['enterprise', 'price-sensitive', 'urgente']
      -> Accion sugerida + email draft

  -> Cualificacion manual (vendedor valida)
    -> Conversion:
      a) Lead -> Cliente (si no existe) + Oportunidad
      b) Oportunidad en pipeline Kanban (etapas: lead/propuesta/negociacion/ganado/perdido)
      c) Oportunidad -> Cotizacion
```

---

## 7. INTEGRACIONES IA (10+ puntos)

| # | Funcionalidad | Endpoint API | Lib | Modelo | Fallback |
|---|--------------|-------------|-----|--------|----------|
| 1 | Lead scoring automatico | `POST /api/leads/score` | `src/lib/ai/score-lead.ts` | Gemini 2.0 Flash | Claude Sonnet 4 |
| 2 | Supplier scoring | `POST /api/suppliers/score` | `src/lib/ai/score-supplier.ts` | Gemini 2.0 Flash | Claude Sonnet 4 |
| 3 | Parseo OC cliente (PDF) | `POST /api/oc/parse` | `src/lib/ai/parse-oc-pdf.ts` | Gemini 2.0 Flash | Claude Sonnet 4 |
| 4 | Parseo extracto bancario | `POST /api/bank-statements/parse` | `src/lib/ai/parse-bank-statement.ts` | Gemini 2.0 Flash | Claude Sonnet 4 |
| 5 | Parseo factura compra | `POST /api/invoices/parse` | `src/lib/invoicing/parse-invoice-pdf.ts` | Gemini 2.0 Flash | Claude Sonnet 4 |
| 6 | OCR de recibos/gastos | `POST /api/ai/ocr-receipt` | N/A (inline) | Gemini Vision | - |
| 7 | Transcripcion voz SAT | `POST /api/ai/transcribe` | N/A (inline) | Gemini/Whisper | - |
| 8 | Asistente chat flotante | `POST /api/assistant/chat` | `src/lib/ai.ts` | Claude Sonnet 4 | Gemini |
| 9 | Resumen ejecutivo diario | `POST /api/ai/daily-summary` | N/A (inline) | Gemini 2.0 Flash | Claude |
| 10 | Agente autonomo | `POST /api/ai/agent` | `src/lib/ai/agent-executor.ts` | Claude Sonnet 4 | Gemini |
| 11 | Aging report IA | `GET /api/cashflow/aging` | `src/lib/cashflow/aging-ai.ts` | Gemini | Claude |
| 12 | Cash flow forecast IA | `GET /api/cashflow/forecast` | `src/lib/cashflow/forecast.ts` | Gemini | Claude |

### Patron comun de IA
Todas las funciones IA usan `src/lib/ai.ts` como capa de abstraccion:
- `askAI(messages, {provider, maxTokens})` — interfaz unificada
- `aiQuery(systemPrompt, userPrompt, provider)` — helper rapido
- Default: Gemini para queries rapidos/baratos, Claude para analisis complejos
- Respuestas se cachean en tablas `tt_ai_summaries`, `tt_agent_tasks`, campos `ai_*` en leads/oportunidades/suppliers

---

## 8. CRON JOBS

Configurados en `vercel.json`:

| Schedule | Path | Descripcion |
|----------|------|-------------|
| `0 7 * * *` (7:00 AM) | `/api/ai/daily-summary?cron=1` | Genera resumen ejecutivo IA diario para cada empresa |
| `0 8 * * *` (8:00 AM) | `/api/cron/alerts` | Genera alertas (facturas vencidas, leads frios, stock bajo, cotizaciones por vencer) |
| `5 8 * * *` (8:05 AM) | `/api/cron/daily-digest` | Envia digest diario por email a usuarios con digest habilitado |
| `0 10 * * *` (10:00 AM) | `/api/fx/rates` | Actualiza tipos de cambio (DolarAPI + ECB) |
| `*/15 * * * *` (cada 15 min) | `/api/sequences/process` | Procesa cola de emails de secuencias automaticas |
| `*/15 * * * *` (cada 15 min) | `/api/cron/check-emails` | Revisa Gmail por emails nuevos y crea leads automaticamente |

Todos protegidos con `CRON_SECRET` en header `Authorization: Bearer`.

---

## 9. COMPONENTES REUTILIZABLES CLAVE

### Workflow / Documentos
| Componente | Path | Funcion |
|-----------|------|---------|
| `DocumentProcessBar` | `src/components/workflow/document-process-bar.tsx` | **Barra sticky obligatoria** en toda pantalla de documento. Muestra codigo, estado, stepper, alertas, acciones. |
| `DocumentChain` | `src/components/workflow/document-chain.tsx` | Visualiza cadena de documentos vinculados (cot->ped->alb->fac) |
| `DocumentDetailLayout` | `src/components/workflow/document-detail-layout.tsx` | Layout estandar para detalle de documento |
| `DocumentForm` | `src/components/workflow/document-form.tsx` | Formulario generico de documento |
| `DocumentActions` | `src/components/workflow/document-actions.tsx` | Panel de acciones disponibles segun estado |
| `DocumentItemsTree` | `src/components/workflow/document-items-tree.tsx` | Arbol de items con componentes |
| `SendToClientButton` | `src/components/workflow/send-to-client-button.tsx` | Boton para enviar documento por email/WhatsApp |
| `SendDocumentModal` | `src/components/workflow/send-document-modal.tsx` | Modal de envio con preview |
| `GenerateDeliveryNoteModal` | `src/components/workflow/generate-delivery-note-modal.tsx` | Modal para generar albaran desde pedido |
| `WorkflowArrowBar` | `src/components/workflow/workflow-arrow-bar.tsx` | Barra de flechas de workflow visual |
| `ProcessLine` | `src/components/workflow/process-line.tsx` | Linea de proceso con color-code |

### IA
| Componente | Path | Funcion |
|-----------|------|---------|
| `AIAssistant` | `src/components/ai/ai-assistant.tsx` | Chat flotante del asistente IA |
| `VoiceChat` | `src/components/ai/voice-chat.tsx` | Entrada de voz para SAT y chat |
| `VoiceRecorder` | `src/components/ai/voice-recorder.tsx` | Grabador de audio |
| `AgentPanel` | `src/components/ai/agent-panel.tsx` | Panel del agente autonomo IA |
| `DailySummaryCard` | `src/components/ai/daily-summary-card.tsx` | Tarjeta de resumen diario |
| `LeadScoreBadge` | `src/components/ai/lead-score-badge.tsx` | Badge visual del score IA de lead |
| `OCParserModal` | `src/components/ai/oc-parser-modal.tsx` | Modal de parseo de OC con IA |
| `ReceiptScanner` | `src/components/ai/receipt-scanner.tsx` | Scanner OCR de recibos |
| `BankStatementUploader` | `src/components/ai/bank-statement-uploader.tsx` | Uploader + parseo de extractos bancarios |

### Facturacion
| Componente | Path | Funcion |
|-----------|------|---------|
| `InvoiceMethodSelector` | `src/components/invoicing/invoice-method-selector.tsx` | Selector de metodo (Tango/manual/externo) |
| `InvoiceConfirmModal` | `src/components/invoicing/invoice-confirm-modal.tsx` | Modal de confirmacion de factura |
| `InvoicePDFUploader` | `src/components/invoicing/invoice-pdf-uploader.tsx` | Upload de PDF de factura |
| `InvoicePDFViewer` | `src/components/invoicing/invoice-pdf-viewer.tsx` | Visor de PDF de factura |
| `TangoConfigModal` | `src/components/invoicing/tango-config-modal.tsx` | Config de credenciales Tango |

### UI General
| Componente | Path | Funcion |
|-----------|------|---------|
| `CommandPalette` | `src/components/command-palette.tsx` | Buscador global (Cmd+K) |
| `AlertsBell` | `src/components/alerts/alerts-bell.tsx` | Campana de alertas en topbar |
| `CompanySelector` | `src/components/ui/company-selector.tsx` | Selector multi-empresa en topbar |
| `PermissionGuard` | `src/components/auth/permission-guard.tsx` | Wrapper que oculta contenido sin permisos |
| `BarcodeScanner` | `src/components/pwa/barcode-scanner.tsx` | Scanner de codigos de barras (camara) |
| `SyncStatus` | `src/components/pwa/sync-status.tsx` | Indicador de estado offline/sync |
| `InstallPrompt` | `src/components/pwa/install-prompt.tsx` | Prompt de instalacion PWA |

### SAT
| Componente | Path | Funcion |
|-----------|------|---------|
| `SATWorkflow` | `src/components/sat/sat-workflow.tsx` | Workflow visual del SAT |
| `InspectionGrid` | `src/components/sat/inspection-grid.tsx` | Grilla de inspeccion/diagnostico |
| `MediaCapture` | `src/components/sat/media-capture.tsx` | Captura de fotos/video en SAT |
| `PhotoUploader` | `src/components/sat/photo-uploader.tsx` | Upload de fotos de reparacion |
| `AssetSelector` | `src/components/sat/asset-selector.tsx` | Selector de activo registrado |
| `BulkQuoteWizard` | `src/components/sat/bulk-quote-wizard.tsx` | Wizard para cotizar reparacion masiva |
| `PauseModal` | `src/components/sat/pause-modal.tsx` | Modal para pausar ticket (esperando repuesto) |

### Dashboard
| Componente | Path | Funcion |
|-----------|------|---------|
| `DashboardGrid` | `src/components/dashboard/dashboard-grid.tsx` | Grid personalizable de widgets (react-grid-layout) |
| `WidgetPicker` | `src/components/dashboard/widget-picker.tsx` | Selector de widgets para dashboard |
| `WidgetWrapper` | `src/components/dashboard/widget-wrapper.tsx` | Wrapper con titulo/resize para widgets |

### CRM
| Componente | Path | Funcion |
|-----------|------|---------|
| `SequenceBuilder` | `src/components/crm/sequence-builder.tsx` | Constructor visual de secuencias de email |
| `WhatsAppSendButton` | `src/components/crm/whatsapp-send-button.tsx` | Boton para enviar WhatsApp |

### Clientes
| Componente | Path | Funcion |
|-----------|------|---------|
| `ClientMerge` | `src/components/clients/client-merge.tsx` | Merge de clientes duplicados |
| `ContactCard` | `src/components/clients/contact-card.tsx` | Tarjeta de contacto |
| `RelatedCompanies` | `src/components/clients/related-companies.tsx` | Empresas relacionadas (grupo) |
| `SyncContactsButton` | `src/components/clients/sync-contacts-button.tsx` | Sincronizar contactos con Google |

---

## 10. REGLAS DE NEGOCIO

### Numeracion de documentos
- Formato: `TIPO-PREFIJO_EMPRESAANO-NUMERO` (ej: `COT-TT2026-0004`)
- Generado automaticamente por trigger SQL `next_document_code(company_id, type)`
- Numeracion se reinicia por ano
- Tipos de prefijo: COT, PED, ALB, REM, PCK, FAC, NC, ND, REC, GAS, OC, FCP, ALC, LEAD, OPP, PRE

### Multi-empresa
- Todo query debe filtrar por `company_id IN (activeCompanyIds)`
- `useCompanyContext().visibleCompanies` es la unica fuente de empresas a mostrar
- Los dropdowns de empresa solo muestran `visibleCompanies`
- localStorage persiste la seleccion entre sesiones

### Moneda
- Moneda default de cada empresa: EUR (TT), ARS (BS/TQ), USD (GA)
- Moneda en documentos es editable (override por cotizacion/pedido)
- Tipos de cambio diarios en `tt_fx_rates`
- Fuentes: DolarAPI (ARS), ECB (EUR/USD), manual

### IVA
| Empresa | Pais | IVA default | Notas |
|---------|------|-------------|-------|
| TT | Espana | 21% | Exportaciones a fuera UE: 0% |
| BS | Argentina | 21% | IVA reducido 10.5% para algunos items |
| TQ | Argentina | 21% | Idem BS |
| GA | USA | 0% | Sin IVA federal (sales tax estatal variable) |

### Incoterms
Soportados en cotizaciones y pedidos: EXW, FCA, CPT, CIF, DAP, DDP, FOB, CFR, etc.

### Condiciones de pago
Tipos: `contado`, `anticipado`, `dias_ff` (dias fecha factura), `dias_fv` (dias fecha vencimiento), `dias_fr` (dias fecha remito), `custom`. Campo `payment_days` para el numero de dias.

### Status de documentos
- Cotizacion: borrador -> enviada -> aceptada -> rechazada -> expirada -> facturada
- Pedido: borrador -> confirmado -> en_preparacion -> enviado -> entregado -> facturado -> cancelado
- OC: borrador -> enviada -> confirmada -> recibida_parcial -> recibida -> cancelada
- Factura: draft -> emitted -> authorized (CAE/AFIP) -> sent -> collected
- SAT: abierto -> en_proceso -> esperando_repuesto -> resuelto -> cerrado

### Cadena de documentos
Cotizacion -> Pedido de venta -> Albaran/Remito -> Factura -> Cobro. Cada conversion crea un link en `tt_document_links` con `relation_type`.

---

## 11. ARCHIVOS CLAVE (Top 20 para un dev nuevo)

| # | Path | Que hace |
|---|------|----------|
| 1 | `src/components/ui/sidebar.tsx` | Sidebar con todos los nav items, badges, permisos |
| 2 | `src/lib/company-context.tsx` | Context de multi-empresa (REGLA DE ORO) |
| 3 | `src/lib/workflow-definitions.ts` | Workflows de todos los tipos de documento (11 tipos) |
| 4 | `src/lib/process-engine.ts` | Core del process engine (crear, avanzar, recalcular) |
| 5 | `src/lib/ai.ts` | Capa de abstraccion IA (Claude + Gemini unificados) |
| 6 | `src/lib/rbac.ts` | Sistema de permisos RBAC |
| 7 | `src/lib/document-helpers.ts` | Helpers de documentos (mapeo status, extraccion datos) |
| 8 | `src/lib/invoicing/tango-client.ts` | Cliente API Tango para facturacion AFIP |
| 9 | `src/lib/ai/score-lead.ts` | Scoring IA de leads |
| 10 | `src/lib/ai/parse-oc-pdf.ts` | Parseo de OC de cliente con IA |
| 11 | `src/lib/ai/parse-bank-statement.ts` | Parseo de extractos bancarios con IA |
| 12 | `src/lib/fx/fetch-rates.ts` | Obtencion de tipos de cambio (DolarAPI + ECB) |
| 13 | `src/lib/cashflow/forecast.ts` | Forecast de cash flow |
| 14 | `src/lib/alerts/generate-alerts.ts` | Generacion de alertas automaticas |
| 15 | `src/components/workflow/document-process-bar.tsx` | Barra sticky obligatoria en documentos |
| 16 | `src/components/ai/ai-assistant.tsx` | Chat flotante del asistente IA |
| 17 | `src/components/command-palette.tsx` | Buscador global Cmd+K |
| 18 | `AGENTS.md` | Reglas fundamentales del ERP (process bar + multi-empresa) |
| 19 | `supabase/schema.sql` | Schema base de datos (tablas core) |
| 20 | `supabase/FULL-MIGRATION-v17-to-v32.sql` | Migraciones v17-v32 (facturacion, CRM, IA, cashflow, etc.) |

---

## 12. ESTADO ACTUAL Y GAPS

### Lo implementado (Fase 1 — "Secretaria Reactiva")

#### 18/18 pasos E2E cubiertos
1. Captura de lead (formulario publico, email, WhatsApp, manual)
2. Scoring IA automatico (Gemini/Claude)
3. Pipeline CRM Kanban
4. Cotizacion multi-empresa
5. Envio al cliente (email/WhatsApp)
6. Importar OC del cliente (parseo IA)
7. Pedido de venta
8. Albaran/Remito (entrega parcial/total)
9. Factura (Tango API / manual / externa)
10. Cobro y conciliacion bancaria
11. OC a proveedores
12. Recepcion de mercaderia
13. SAT completo (5 etapas con voz, fotos, torque)
14. Dashboard ejecutivo con resumen IA
15. Alertas automaticas
16. Cash flow forecast
17. Tipos de cambio diarios
18. Email sequences automaticas

#### 5 paquetes implementados
1. **Paquete 1:** Facturacion multi-proveedor (Tango + manual + externa)
2. **Paquete 2:** CRM Scale (leads IA, secuencias email, formularios publicos, portal cliente)
3. **Paquete 3:** IA Avanzada (agente autonomo, voice SAT, OCR recibos, resumen diario)
4. **Paquete 4:** Cash Flow bajo control (FX rates, aging, forecast, conciliacion)
5. **Paquete 5:** Supplier Features (scoring IA, interactions, portal proveedor)

### Lo que falta para Fase 2 — "Copiloto Proactivo"
- Sugerencias proactivas de la IA (upsell, cross-sell, re-engagement)
- Automatizacion de tareas repetitivas (el agente actua sin instruccion)
- Prediccion de churn de clientes
- Analisis predictivo de demanda (stock)
- Dashboard personalizable con widgets drag-and-drop (parcialmente implementado)
- Reportes avanzados con graficos interactivos
- Integracion calendario Google para reuniones
- PWA offline completa (partially implemented: sync-manager, offline-store)

### Lo que falta para Fase 3 — "Piloto Autonomo"
- Agente IA que ejecuta flujos completos sin supervision
- Aprendizaje de patrones de negocio
- Optimizacion automatica de precios
- Gestion de inventario predictiva
- Integracion con transportistas (tracking automatico)
- Multi-idioma (actualmente solo espanol)
- App mobile nativa (actualmente PWA)
- Integracion contable completa (no solo facturacion)
- SOC 2 / GDPR compliance
- RLS refinado por empresa (actualmente permisivo)

### Bugs y mejoras pendientes conocidos
- RLS es actualmente permisivo (`USING (true)`) — debe refinarse por empresa/usuario
- Envio de email en daily-digest es placeholder (console.log) — falta integracion SMTP real
- PWA offline parcial — sync-manager existe pero falta offline-first para queries
- Migracion StelOrder parcial — faltan mapeos para algunos tipos de documentos
- Tango API necesita credenciales reales por empresa (actualmente config manual)
