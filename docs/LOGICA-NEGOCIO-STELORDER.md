# Lógica de negocio — Basada en análisis de StelOrder

## Principio fundamental: TRAZABILIDAD DOCUMENTAL

Cada documento "hijo" cierra automáticamente al "padre". La cadena completa queda trazada y es ineditable hacia atrás.

---

## FLUJO DE VENTAS

### Cadena documental:
```
PRESUPUESTO → PEDIDO → ALBARÁN (remito) → FACTURA → RECIBO (cobro)
```

### 1. Presupuesto (Cotización)
- Primer paso de una operación de venta
- Se puede generar a clientes existentes o potenciales
- Campos: empresa, cliente, productos, cantidades, precios, descuentos, notas por línea, incoterms
- Estados: ABIERTO, CERRADO (cuando se genera pedido/albarán/factura)
- Desde un presupuesto se puede generar: Pedido, Albarán, o Factura directamente
- Al generar documento hijo → presupuesto queda CERRADO automáticamente

### 2. Pedido de venta
- Intención firme del cliente de comprar
- Se genera desde presupuesto o directamente
- Campos: mismos que presupuesto + fecha entrega comprometida
- Estados: ABIERTO, CERRADO
- Desde pedido se genera: Albarán o Factura
- ENTREGAS PARCIALES: un pedido puede generar MÚLTIPLES albaranes

### 3. Albarán de venta (Remito de entrega)
- Documento que acredita la entrega del material
- Se genera desde pedido o directamente
- ENTREGAS PARCIALES: desde un pedido se generan N albaranes con cantidades parciales
- Campos: productos entregados, cantidades, fecha entrega, dirección
- Estados: ABIERTO, CERRADO
- Desde albarán se genera: Factura

### 4. Factura
- Documento fiscal/legal
- Se genera desde albarán o directamente
- **FACTURACIÓN MULTI-ALBARÁN**: se pueden seleccionar N albaranes de un mismo cliente y generar 1 factura unificada
- Al guardar factura se generan automáticamente RECIBOS
- Si hay vencimientos configurados → múltiples recibos escalonados
- Estados de factura dependen 100% del estado de los recibos:
  - Todos recibos pagados → COBRADA
  - Algún recibo pagado → PARCIALMENTE COBRADA
  - Ninguno pagado → PENDIENTE
- Nexo con Tango: la factura se emite en Tango/AFIP y el número se registra acá

### 5. Recibo (Cobro)
- Se genera automáticamente al crear factura
- Múltiples recibos por factura (vencimientos escalonados)
- Se marca como cobrado con: fecha, método de pago, referencia bancaria

---

## FLUJO DE COMPRAS

### Cadena documental:
```
PEDIDO A PROVEEDOR → RECEPCIÓN (albarán de compra) → FACTURA DE COMPRA → PAGO
```

### 1. Pedido a proveedor
- Se genera manualmente o desde necesidad de stock
- Campos: proveedor, productos, cantidades, precios de compra
- RECEPCIONES PARCIALES: un pedido puede generar múltiples recepciones

### 2. Recepción (Albarán de compra)
- Acredita que la mercadería llegó
- Puede ser parcial sobre el pedido original
- Actualiza stock automáticamente

### 3. Factura de compra
- Registra la factura del proveedor
- Se vincula a recepciones
- Genera recibos de pago pendientes

---

## FLUJO INVERSO (venta con pago anticipado)

```
PRESUPUESTO → PEDIDO → FACTURA (anticipo) → RECIBO (cobro) → COMPRA → RECEPCIÓN → ALBARÁN
```

- El cobro se registra antes de remitir
- No se puede generar albarán hasta tener la mercadería
- La factura puede ser de anticipo

---

## ENTREGAS PARCIALES

### En ventas:
- Un pedido de 100 unidades puede generar:
  - Albarán 1: 30 unidades (fecha X)
  - Albarán 2: 50 unidades (fecha Y)
  - Albarán 3: 20 unidades (fecha Z)
- Cada albarán resta del pedido original
- El pedido muestra "pendiente de entregar: X unidades"
- La factura puede ser por albarán individual o agrupada

### En compras:
- Misma lógica: un pedido a proveedor genera N recepciones parciales
- El stock se actualiza con cada recepción

---

## HISTORIAL / AUDITORÍA

Cada entidad registra:
- Quién creó el documento, cuándo
- Quién lo modificó, qué cambió
- Documentos padre/hijo vinculados
- Estado actual y transiciones

Se puede acceder al historial desde:
- Producto → ver todas las cotizaciones, pedidos, albaranes, facturas donde aparece
- Cliente → ver toda su operatoria
- Remito → ver de qué pedido salió, a qué factura pertenece
- Factura → ver albaranes incluidos, cobros realizados

---

## MÓDULO SAT (Servicio Técnico)

Misma lógica documental que ventas pero agrega:
- Incidencia como punto de entrada
- Asignado a (técnico responsable)
- Dirección de trabajo (puede ser diferente al domicilio del cliente)
- Facturar a (puede ser diferente al cliente)
- Activos/equipos vinculados con historial de servicio
- Diagnóstico, fallas, resolución

Flujo:
```
INCIDENCIA → PRESUPUESTO SAT → PEDIDO SAT → ALBARÁN SAT → FACTURA
```

---

## MULTI-EMPRESA

StelOrder no tiene multi-empresa nativo. Simula con plantillas y referencias distintas.

**Nuestro sistema SÍ va a tener multi-empresa real:**
- TorqueTools SL (España) — EUR
- BuscaTools SA (Argentina) — ARS
- Torquear SA (Argentina) — ARS
- Global Assembly Solutions LLC (USA) — USD

Cada empresa tiene su propia:
- Numeración de documentos
- Moneda por defecto
- Datos fiscales
- Logo y firma

---

## CATÁLOGO / PRODUCTOS

- Fichas de producto con: nombre, SKU, marca, categoría, precio venta, precio costo, imágenes, documentos adjuntos
- Listas de precios por cliente o grupo
- Tarifas de compra por proveedor
- Stock multi-almacén
- Unidades de medida
- Impuestos configurables por producto

---

## INFORMES / EXPORTACIÓN

Todo exportable a:
- PDF (documentos individuales)
- Excel/CSV (listados, informes)
- Filtrable por: fecha, cliente, producto, vendedor, empresa, estado

Informes disponibles:
- Ventas por período/cliente/vendedor
- Compras por proveedor
- Stock actual y movimientos
- Cobros pendientes/realizados
- Rentabilidad por producto
- Actividad del equipo

---

## PERMISOS / ROLES

- Permisos granulares por módulo
- Roles: Admin, Vendedor, Técnico, Solo lectura
- Vendedores solo ven sus propias transacciones
- Admin ve todo
- Informes de empleados solo para superadmin
