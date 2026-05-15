# FASE 2.1 — Comparativa formal de proveedores API fiscal

**Fecha:** 2026-05-12
**Autor:** Claude Code (research compilado)
**Estado:** Borrador para decisión de Juan.

> ⚠️ **Importante.** Esta comparativa se basa en información pública y mi conocimiento del mercado. **Antes de firmar contratos, hay que confirmar con cada proveedor**: precios actualizados, SLA, soporte de tu volumen específico, sandbox disponible. Las recomendaciones de abajo son guías, no veredictos.

---

## Recomendación ejecutiva

**Argentina → TusFacturas.app** (multi-CUIT, REST puro, ~USD 30/mes por CUIT).
**España → Verifacti** (especializado en Verifactu, REST clara, pricing por documento).

**Plan de PoC sugerido**: 2 días de integración por país en sandbox, contra una FAC de prueba real (anulable). Recién ahí firmar contrato productivo.

---

## ARGENTINA — 4 candidatos

### Criterios de evaluación

| Criterio | Peso | Por qué importa |
|---|---|---|
| REST API (no SOAP) | Alto | SOAP requiere certificados X.509, mantenimiento alto, librerías especializadas. |
| Multi-CUIT en una cuenta | Alto | TORQUEAR SA + BUSCATOOLS SA en la misma integración. |
| Sandbox real | Alto | Validar antes de tocar facturación productiva. |
| Costo por CUIT/mes | Medio | Volumen estimado: ~100-300 FAC/mes por empresa. |
| Soporte Factura A/B + NC + ND | Alto | Cobertura completa del flujo comercial. |
| Soporte multi-punto-venta | Medio | Cada empresa tiene PV propio en AFIP. |
| Cuit del cliente lookup | Bajo | Útil pero no bloqueante. |
| Reportes/dashboard propio | Bajo | Vos ya tenés el dashboard en Mocciaro Soft. |

### Tabla comparativa AR

| Característica | **TusFacturas.app** | **AFIP SDK (Afipsdk)** | **Contabilium** | **Tango Sales** |
|---|---|---|---|---|
| Tipo | REST API gateway | REST wrapper sobre WS AFIP | ERP completo con API | ERP completo con API |
| URL | tusfacturas.app | afipsdk.com | contabilium.com | tangonet.com.ar |
| Pricing aprox. | USD 25–40/mes por CUIT, flat | USD 50/mes flat (todos CUIT) | ARS 40k+/mes (plan base) | ARS 80k+/mes (Restô/Punto/Gestión) |
| Multi-CUIT | ✅ (1 cuenta, N CUITs) | ✅ (1 cuenta, N CUITs) | ❌ (1 empresa por cuenta, addon costoso) | ❌ (instalación por empresa) |
| Factura A/B/C/M | ✅ | ✅ | ✅ | ✅ |
| NC / ND | ✅ | ✅ | ✅ | ✅ |
| Multi-punto-venta | ✅ | ✅ | ✅ | ✅ |
| Sandbox público | ✅ ambiente "homologación" | ✅ "testing" | ⚠️ solo demo guiado | ❌ |
| Idempotency keys | ❌ (manual) | ❌ (manual) | ❌ | ❌ |
| Webhooks | ❌ (polling) | ❌ | ⚠️ limitado | ❌ |
| Docs API | ✅ buenas, OpenAPI/Postman | ✅ buenas | ⚠️ pobres | ❌ |
| Tiempo de alta (sandbox) | <1 día | <1 día | 3–5 días con vendedor | 1–2 semanas con consultor |
| SOAP por debajo | sí (oculto al user) | sí (oculto) | sí (oculto) | sí (oculto) |
| **Veredicto** | **Recomendado** | Backup | Overkill | Descartado |

### Notas por proveedor (AR)

**TusFacturas.app** — Mi recomendación. Es un gateway puro: lo único que hace es exponer una API REST limpia que internamente habla con los WS de AFIP. Pricing por CUIT habilitado, sin volumen mínimo de facturas. Soporte por email decente. Doc en `https://developers.tusfacturas.app/` con ejemplos en curl/PHP/Node. El sandbox usa el ambiente de homologación de AFIP (datos no fiscales reales, no contan). Ideal para Mocciaro Soft porque vos ya tenés tu lógica de pricing/clientes/etc.

**AFIP SDK (Afipsdk.com)** — Segunda opción. Similar a TusFacturas pero un poco más sofisticado: SDK oficial en varios lenguajes, mejor documentación técnica. Pricing flat USD 50/mes para todos los CUITs (más barato que TusFacturas si vas a tener 3+ empresas activas), pero ese flat tiene un cap de ~1000 facturas/mes; arriba pagás por uso. Tier gratuito existe pero con rate-limit (10 req/min) — útil para PoC, no producción.

**Contabilium** — ERP/contable completo argentino. Tiene API pero está pensada para que vos uses sus pantallas, no para integrar tu propio ERP. Pricing pensado para empresas que necesitan TODA la solución contable, no sólo emisor. Si Mocciaro Soft se vuelve más complejo y querés tercerizar contabilidad también, vale considerarlo. Hoy: overkill.

**Tango Sales / Restô / Gestión (Axoft)** — El standard de mercado para PyMEs grandes. Tiene una API "Tango Connect" pero es cara, complicada, y requiere consultor certificado. Pensada para empresas que ya tienen Tango como ERP. **Descartado** porque Mocciaro Soft ES tu ERP.

### Setup para PoC TusFacturas (1 día)

```bash
# 1. Crear cuenta en https://tusfacturas.app/registro
#    Plan free trial 14 días, sin tarjeta.
# 2. Configurar primer CUIT (TORQUEAR SA recomendado por menor volumen):
#    - Subir certificado AFIP (.crt + .key) o usarles el suyo en sandbox.
#    - Habilitar puntos de venta.
# 3. Obtener API token desde el panel.
# 4. Probar emisión de Factura B sandbox:
curl -X POST https://tusfacturas.app/api/v2/facturacion/nuevo \
  -H "Content-Type: application/json" \
  -d '{
    "apitoken": "TU_TOKEN",
    "apikey": "TU_API_KEY",
    "usertoken": "TU_USER_TOKEN",
    "cliente": { "documento_tipo": "DNI", "documento_nro": "12345678", ... },
    "comprobante": { "tipo": "FACTURA B", "operacion": "V", ... },
    "detalle": [...]
  }'
# 5. Verificar CAE recibido + fecha vencimiento.
```

---

## ESPAÑA — 4 candidatos

### Criterios de evaluación

| Criterio | Peso | Por qué importa |
|---|---|---|
| Verifactu compliant | **Crítico** | Obligatorio jul 2026 para >6M€/año, ene 2027 resto. |
| TicketBAI (País Vasco) | Bajo | Solo si facturás a clientes con domicilio fiscal vasco. |
| SII (Suministro Inmediato Información) | Medio | Obligatorio si facturación > 6M€/año o si pedís IVA mensual. |
| FacturaE / Facturae (B2G) | Bajo | Solo si vendés a Administración Pública. |
| REST API + sandbox | Alto | Mismo razonamiento que AR. |
| Costo por documento o flat | Medio | Volumen estimado: ~200-500 FAC/mes para TorqueTools SL. |
| Hash Verifactu generado por la API | Alto | Lo más complejo del Reglamento Antifraude; mejor que lo haga el proveedor. |

### Tabla comparativa ES

| Característica | **Verifacti** | **B2Brouter** | **Holded** | **Bsale** |
|---|---|---|---|---|
| Tipo | API especializada Verifactu | Gateway B2B/B2G | ERP completo con API | ERP completo con API |
| URL | verifacti.com | b2brouter.net | holded.com | bsale.es |
| Especialidad | Verifactu + TicketBAI + SII | Facturae B2G + Verifactu | ERP gestión + Verifactu | ERP gestión + Verifactu |
| Pricing aprox. | EUR 0,05–0,15/factura (vol.) | EUR 0,30–0,50/factura | EUR 30+/usuario/mes | EUR 25+/usuario/mes |
| Plan flat disponible | ✅ desde 200 fact/mes EUR 25 | ❌ siempre por uso | ✅ pero suscripción usuarios | ✅ |
| Sandbox público | ✅ | ✅ | ⚠️ demo guiado | ⚠️ |
| Hash Verifactu generado | ✅ | ✅ | ✅ | ✅ |
| TicketBAI | ✅ | ✅ | ⚠️ con addon | ❌ |
| SII | ✅ | ✅ | ✅ | ✅ |
| Facturae B2G | ⚠️ con addon | ✅ (especialidad) | ❌ | ❌ |
| Multi-empresa/CIF | ✅ | ✅ | ❌ (cuenta por CIF) | ❌ |
| Docs API | ✅ buenas, ejemplos | ✅ buenas | ⚠️ Holded-céntricas | ⚠️ |
| **Veredicto** | **Recomendado** | Si B2G es relevante | Overkill (si no usás Holded) | Descartado |

### Notas por proveedor (ES)

**Verifacti** — Mi recomendación. Empresa española que nació específicamente para resolver Verifactu (Reglamento Antifraude). API REST limpia, pricing por documento (bueno para volumen variable), sandbox real con AEAT-test. Generan el hash Verifactu por vos. Soporte por email + Slack/Discord. **Único riesgo**: empresa joven (fundada ~2023), si necesitás SLA estricto de uptime, validar con ellos. Para PoC y volumen razonable es perfecta.

**B2Brouter** — Más maduro (>10 años en el mercado, founded ~2012), especializado en facturas electrónicas para administraciones públicas (Facturae). Si TorqueTools SL le factura al Estado español (ayuntamientos, ministerios), esta es la opción correcta. Pricing más caro por documento pero incluye Facturae B2G nativo. Para B2B puro está bien también.

**Holded** — ERP completo (CRM + contabilidad + facturación + nómina). Pensado para empresas que NO tienen ERP propio. Si Mocciaro Soft no existiera, sería una opción. Para vos hoy: **overkill y se solapa con tu app**.

**Bsale** — Similar a Holded pero más enfocado a retail/POS. **Descartado** por la misma razón.

### Caso particular: FALTA ENVIDO SL

Pendiente confirmación de Juan: si esa empresa NO está operativa todavía, no afecta la decisión de FASE 2.1. Si está operativa, sumar su CIF a Verifacti (sin costo extra de licencia, solo más documentos contados).

### Setup para PoC Verifacti (1 día)

```bash
# 1. Crear cuenta en https://verifacti.com → Free Trial.
# 2. Crear "Tax Identification" en el dashboard:
#    - CIF de TORQUETOOLS SL
#    - Domicilio fiscal
#    - Subir certificado digital (FNMT) o usarles el suyo (sandbox).
# 3. Crear API key.
# 4. Probar emisión Verifactu en sandbox:
curl -X POST https://api.verifacti.com/v1/invoices \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "type": "F1",
    "serie": "TT2026",
    "number": "0001",
    "issue_date": "2026-05-12",
    "issuer": { "tax_id": "B12345678", "name": "TorqueTools SL" },
    "recipient": { "tax_id": "B87654321", "name": "Cliente Demo SL" },
    "items": [
      { "description": "Servicio test", "quantity": 1, "unit_price": 100, "tax_rate": 21 }
    ]
  }'
# 5. Verificar respuesta: invoice_id + hash_verifactu + qr_url.
```

---

## Plan de integración técnica (FASE 2)

Asumiendo TusFacturas (AR) + Verifacti (ES), la arquitectura sería:

```
Mocciaro Soft (Supabase)
    │
    │  POST /api/billing/ar/emit { invoice_id }
    │  POST /api/billing/es/emit { invoice_id }
    │
    ▼
Next.js API routes (Vercel)
    │
    │  HTTPS + Bearer token (env var)
    │
    ▼
TusFacturas.app  ─────► AFIP WS (oculto)
Verifacti        ─────► AEAT Verifactu
```

**Tabla nueva mínima:**

```sql
-- migration-v76 (FASE 2)
CREATE TABLE tt_fiscal_emissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id UUID REFERENCES tt_invoices(id) ON DELETE CASCADE,
  country TEXT NOT NULL CHECK (country IN ('AR', 'ES')),
  provider TEXT NOT NULL CHECK (provider IN ('tusfacturas', 'verifacti', 'b2brouter')),
  -- Estado del proceso
  status TEXT NOT NULL CHECK (status IN ('pending', 'sent', 'accepted', 'rejected', 'voided')),
  attempt_count INT NOT NULL DEFAULT 0,
  -- Respuesta del proveedor
  external_id TEXT,            -- ID asignado por el proveedor
  external_response JSONB,
  -- Específico AR
  cae TEXT,
  cae_due_date DATE,
  afip_voucher_number TEXT,
  -- Específico ES
  verifactu_hash TEXT,
  verifactu_qr_url TEXT,
  -- Error tracking
  last_error TEXT,
  last_error_at TIMESTAMPTZ,
  next_retry_at TIMESTAMPTZ,
  -- Auditoría
  emitted_by UUID REFERENCES tt_users(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  accepted_at TIMESTAMPTZ,
  rejected_at TIMESTAMPTZ
);
```

**Idempotencia:** la key es `fiscal_emit:{invoiceId}:{country}` — vos no podés emitir dos veces la misma factura legal por el mismo CIF. El proveedor también suele tener idempotency_key propio que se puede pasar como header.

**RBAC:** todos los endpoints `/api/billing/*` chequean `emit_legal_invoice` (creado en v75). Sólo `fiscal_admin` y `super_admin`.

**Modo degradado:** si el proveedor está caído, la factura queda en status `pending` con reintento automático cada 5 min hasta 12 intentos (≈1 hora). Después, marca `last_error` + alerta a admin.

---

## Riesgos y mitigaciones

1. **Verifactu obligatorio jul 2026 si TorqueTools SL >6M€/año.**
   - **Verificar**: facturación anual de TorqueTools SL.
   - **Si >6M€**: arrancar FASE 3 con prioridad ALTA. Si no llegamos a julio, hay multa de hasta EUR 50k.
   - **Si <6M€**: hay hasta enero 2027, sin pánico.

2. **TusFacturas dependencia de tercero.**
   - Mitigación: backup nightly de `tt_fiscal_emissions` con `external_response` completo → si TusFacturas desaparece, podés reemitir contra AFIP directo con los datos.
   - Pre-requisito: backup S3/GCS confirmado.

3. **Numeración correlativa durante operación dual con STEL.**
   - **Crítico**: el día del corte, leer último número de comprobante por punto de venta en STEL y persistir en `tt_companies.starting_voucher_number_by_pos` para que Mocciaro Soft tome desde ahí.
   - **STEL deja de emitir en esa empresa el mismo día.** No hay overlap. No hay doble emisión legal.

4. **Costos escalan con volumen.**
   - TusFacturas: USD 30/mes × 2 CUITs = USD 60/mes ≈ USD 720/año.
   - Verifacti: si 300 FAC/mes × EUR 0,10 = EUR 30/mes ≈ EUR 360/año.
   - **Total estimado FASE 2+3 año 1: USD ~1.100**.

5. **Sandbox de TusFacturas usa AFIP homologación → emisiones no aparecen en tu CUIT real.**
   - PoC seguro. Cuando pasás a producción cambias el flag + certificado real.

6. **El certificado de AFIP vence cada 2 años.**
   - Renovación manual via AFIP. Agendar recordatorio para 2027 (asumiendo certificado nuevo en 2026 al arrancar). Si vence sin renovar, las facturas quedan en `pending` automáticamente.

---

## Próximos pasos sugeridos

| # | Acción | Quién | ETA |
|---|---|---|---|
| 1 | Confirmar facturación anual TorqueTools SL (define urgencia Verifactu) | **Juan** | esta semana |
| 2 | Confirmar si FALTA ENVIDO SL está operativa | **Juan** | esta semana |
| 3 | Crear cuenta TusFacturas free trial + cargar certificado TORQUEAR | **Juan** o yo si me pasás creds | 1 día |
| 4 | Crear cuenta Verifacti free trial + cargar certificado TORQUETOOLS | **Juan** | 1 día |
| 5 | PoC AR: emitir 1 factura B sandbox + recibir CAE | **Claude Code** | 1 día (post-#3) |
| 6 | PoC ES: emitir 1 factura sandbox + recibir hash Verifactu | **Claude Code** | 1 día (post-#4) |
| 7 | Si ambos PoCs OK → firmar contratos productivos | **Juan** | 1 semana |
| 8 | Migration v76 (`tt_fiscal_emissions`) + RBAC final | **Claude Code** | 1 día |
| 9 | Endpoints `/api/billing/ar/emit` + tests | **Claude Code** | 3 días |
| 10 | Endpoints `/api/billing/es/emit` + tests | **Claude Code** | 3 días |
| 11 | Wire UI: botón "Emitir factura legal" en `/ventas` | **Claude Code** | 2 días |
| 12 | Backup nightly Supabase → S3/GCS configurado | **Juan** o yo si pasás creds AWS/GCP | 1 día (pre-requisito FASE 2) |

**ETA total FASE 2 (AR) sólo el código: ~7-8 días útiles.**
**ETA total FASE 3 (ES) sólo el código: ~6-7 días útiles** (estructura reusable post FASE 2).

---

## Pendientes de decisión de Juan

1. ¿Facturación anual TorqueTools SL >6M€ o <6M€?
2. ¿FALTA ENVIDO SL operativa? Si sí, ¿también necesita facturación legal ES?
3. ¿Confirmás TusFacturas (AR) + Verifacti (ES)?
4. ¿Querés que arme el PoC sandbox? Si sí, pasame las credenciales una vez creadas las cuentas.
5. ¿Tenés cuenta AWS / GCP para backup nightly, o querés que use Supabase pg_dump → GitHub Actions artifact como fallback gratis?

Cuando me confirmes estos 5 puntos, arranco FASE 2 con migration v76 y endpoints `/api/billing/ar/emit`.
