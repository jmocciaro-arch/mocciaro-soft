# SPEC: Dashboard v2 + Módulo Canales — Mocciaro Soft

**Para:** Claude Code (repo jmocciaro-arch/mocciaro-soft)
**Referencia visual:** `mocciaro-soft-v2-mockup.html` (aprobado por Juan)
**Base de datos:** YA MIGRADA en producción (v91–v93). No crear tablas: existen.

---

## 0. Estado de la base (no tocar, ya aplicado)

- `tt_channels` — 16 filas seed (4 canales × 4 empresas), todas `enabled=false`
- `tt_channel_listings`, `tt_channel_orders` — vacías, con índices y RLS company-scoped (`current_company_id()`)
- Permisos módulo `canales` en `tt_permissions`: `view_channels`, `manage_channels`, `publish_listings`, `manage_channel_orders`
- Grant inicial: roles `super_admin` y `admin`
- Credenciales OAuth de marketplaces: **NUNCA en tt_channels.config** → Supabase Vault o env vars

## 1. Gating multi-empresa + multi-usuario (regla central)

Un usuario ve el módulo Canales y el filtro de canal del dashboard **solo si se cumplen las DOS condiciones**:

```
A) RBAC:    usuario tiene permiso `view_channels` (vía tt_user_roles → tt_role_permissions)
B) Empresa: la empresa activa tiene ≥1 canal con enabled=true en tt_channels
```

- A sin B → módulo visible con empty-state "Sin canales habilitados en {empresa}. Pedí a un admin que los active en Admin → Canales."
- B sin A → módulo y filtro **no se renderizan** (ni deshabilitados: ausentes).
- Staff (Norberto, Facundo, Pamela): el admin asigna permisos por rol desde la UI existente de roles. `publish_listings` y `manage_channel_orders` se otorgan por separado de `view_channels`.

Habilitación por empresa: en `/admin?tab=companies` (o nueva tab `canales`), toggle por canal → `UPDATE tt_channels SET enabled, status`. Solo `manage_channels`.

## 2. Dashboard ejecutivo (replicar mockup)

### 2.1 Barra de filtros
- **Período**: segmented Hoy / 7 días / 30 días / Trimestre. Default 30 días. Persistir en URL (`?p=d30`).
- **Canal**: select Todos / Directo / + canales `enabled` de la empresa activa (dinámico desde tt_channels). Oculto si gating §1 falla.
- **Estado**: Todos / Pagada-Entregado / Abierto / Requiere atención.
- Chips de filtros activos con × individual + "Limpiar filtros".

### 2.2 Comportamiento de KPIs con filtro de canal
| KPI | Filtro canal | Fuente |
|---|---|---|
| Facturación | ✅ recalcula | tt_invoices + tt_channel_orders facturadas, por período |
| Pipeline | ✅ (directo=cotizaciones; canal=0) | tt_quotes abiertas |
| Pendiente cobro | ✅ | tt_invoices impagas; canal: tt_channel_orders sin liquidar |
| Órdenes marketplace | ✅ | count tt_channel_orders por período/canal |
| OC en curso | 🔕 atenuar + "no aplica filtro de canal" | tt_purchase_orders |
| Alertas stock | 🔕 atenuar idem | tt_stock vs mínimos |

- Sparkline 8 puntos por KPI (últimos 8 períodos equivalentes). Trend chip ▲/▼ vs período anterior.
- Sin datos suficientes para sparkline → ocultarla, no inventar.

### 2.3 Tabla actividad
- Unión de últimos eventos (tt_document_events + tt_channel_orders) con columnas Hora/Documento/Tercero/Importe/Estado/Origen.
- Filtra por canal y estado en cliente; contador "X de N".

## 3. Módulo Canales (`/canales`)

1. **Tarjetas de canal** (solo `enabled` de la empresa activa): listings count, órdenes hoy, pendientes, % stock sync, última sync, estado con pulse. Alibaba: siempre badge "Semi-manual" (sin API de seller — flujo export/import).
2. **Órdenes entrantes**: tabla tt_channel_orders. Acción "Crear documento" → genera tt_documents tipo pedido + vincula `document_id` + reserva stock (tt_stock_reservations). Requiere `manage_channel_orders`.
3. **Publicaciones**: tabla tt_channel_listings con estado y errores de sync. Alta requiere `publish_listings`.
4. La sync real con APIs (ML primero) es fase posterior — webhooks vía n8n → tt_channel_orders. Esta fase deja la UI + escritura manual/seed funcionando.

## 4. QA obligatorio (reglas de Juan)

- Contraste WCAG AA en light y dark.
- Densidad StelOrder/Odoo: tablas compactas, 13px, sin aire decorativo.
- Keyboard-first: focus visible, `/` enfoca búsqueda, navegación sin mouse.
- Tests: gating §1 (4 combinaciones A×B), filtros de KPI por canal, RLS (usuario empresa X no ve canales de empresa Y).
- PR con diff + tests antes de merge. No mergear sin smoke test multi-usuario.

## 5. Fuera de alcance de esta fase

- OAuth/tokens de marketplaces, sync automática, pricing dinámico, respuestas IA a preguntas ML.
