# PLAN — Módulo Comex y Logística

> Estado: plan cerrado 2026-06-11. Owner: Juan. Diseño fundado en exploración del código real.

## Objetivo
Calcular costos de flete al cotizar: cargar datos físicos por producto → definir packing y tarifas de couriers → al cotizar, estimar peso facturable y comparar DHL/UPS/FEDEX.

## Decisiones cerradas (Juan, 2026-06-11)
1. **Flete INFORMATIVO** en v1: se muestra la comparativa y se guarda el courier elegido en `tt_documents.metadata.freight`, NO suma al total automáticamente. (Toggle "sumar al total" = mejora futura.)
2. **Tarifas POR EMPRESA**: `tt_carriers` y `tt_carrier_rates` llevan `company_id NOT NULL` + scoping cross-company en los endpoints (patrón channels: accessibleCompanyIds / userHasCompanyAccess, NO confiar en RLS).
3. **Packing ESTIMADO pero corregible**: el motor estima bultos por volumen agregado y la UI deja sobrescribir.
4. (Diseño) Datos físicos en tabla **satélite** `tt_product_logistics`, NO en `tt_products` (el sync StelOrder pisa la fila). Motor lee `COALESCE(gross_weight_kg, net_weight_kg, products.weight_kg)`.

## Modelo de datos (tablas nuevas tt_)
- `tt_product_logistics` (satélite 1:1, FK product_id CASCADE): net/gross_weight_kg, length/width/height_cm, volume_m3, default_packing_id, units_per_packing. GLOBAL (sin company_id).
- `tt_packing_types`: kind (pallet|caja|sobre|otro), code, label, dimensiones, tare_weight_kg, max_payload_kg, active. GLOBAL editable.
- `tt_carriers`: code, name, volumetric_divisor (def 5000), active, **company_id NOT NULL**.
- `tt_carrier_services`: carrier_id, code, label, volumetric_divisor override, transit_days.
- `tt_carrier_zones`: carrier_id, code, label, country_codes[] (ISO-2 → zona).
- `tt_carrier_rates`: carrier_id, service_id?, zone_id, weight_from/to_kg, price, per_kg_over?, currency, **company_id NOT NULL**, valid_from/to.

## Motor de cálculo (src/lib/comex/freight.ts, puro + tests)
1. Peso real = Σ qty × COALESCE(gross, net, weight_kg). SKUs sin peso → warning, no rompe.
2. Peso volumétrico = volumen_total_cm³ / divisor_courier.
3. Packing v1: estima bultos = ceil(volumen_total / volumen_útil_packing) + tara; modo manual override.
4. Peso facturable = max(real+tara, volumétrico), redondeo al step del courier.
5. Lookup: país→zona (country_codes) → tarifa (carrier, service, zone) banda weight_from≤fact≤weight_to; excede último tramo → price + per_kg_over×exceso. Sin tarifa → "sin tarifa" (no excluir).
6. Salida: comparativa por courier ordenada por costo asc + warnings.

## Pantallas — módulo /comex (Tabs)
Físicos | Packing | Couriers | Zonas | Tarifas | Cotizar flete. Gating view_comex/manage_comex. NavItem nuevo en sidebar.

## Fases (cada una un PR ≤500)
- **A** — `tt_product_logistics` + `tt_packing_types` (migración v71) + permisos view_comex/manage_comex + endpoints + ruta /comex (tabs Físicos, Packing) + sidebar. Aditivo, bajo riesgo. ← EN CURSO
- **B** — carriers/services/zones/rates (migración v72, con company_id) + CRUD + tabs.
- **C** — motor freight.ts + tests Vitest + endpoint quote-freight + tab Cotizar flete (standalone).
- **D** — integración cotizador (panel flete en totales, guardar en metadata.freight, NO sumar al total).

## Riesgos / gotchas clave
- Carga manual grande (18k productos, ~24% con peso, 0 con dims). Priorizar SKUs cotizados; guardar parcial OK.
- No hay tabla editable inline genérica: grilla a mano (patrón tab params del admin). Paginar/buscar siempre, nunca cargar 18k.
- Cotizador (Fase D) escribe directo a Supabase, NO usar /api/documents/lines (roto vs esquema real). Totales sin trigger → sumar en el front si alguna vez factura.
- current_company_id() = empresa default, no la activa → pasar company_id explícito.
- Migraciones .sql legacy desincronizadas: verificar columnas contra information_schema. Juan corre migraciones con dry-run.
