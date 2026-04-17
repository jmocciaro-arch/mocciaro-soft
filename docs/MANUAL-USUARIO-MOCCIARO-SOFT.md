# Manual de Usuario — Mocciaro Soft ERP

**Version 2.1 — Abril 2026**
**Plataforma:** Aplicacion web (Next.js / Supabase)
**URL de produccion:** https://cotizador-torquetools.vercel.app

---

## Indice

1. [Introduccion](#1-introduccion)
2. [Primer inicio y configuracion](#2-primer-inicio-y-configuracion)
3. [Dashboard principal](#3-dashboard-principal)
4. [Dashboard ejecutivo](#4-dashboard-ejecutivo)
5. [CRM — Gestion comercial](#5-crm--gestion-comercial)
6. [Cotizador](#6-cotizador)
7. [Ventas](#7-ventas)
8. [Compras](#8-compras)
9. [Finanzas](#9-finanzas)
10. [Stock](#10-stock)
11. [Clientes](#11-clientes)
12. [Catalogo](#12-catalogo)
13. [Proveedores](#13-proveedores)
14. [SAT — Servicio tecnico](#14-sat--servicio-tecnico)
15. [Gastos](#15-gastos)
16. [Hub IA](#16-hub-ia)
17. [Herramientas transversales](#17-herramientas-transversales)
18. [Informes](#18-informes)
19. [Administracion](#19-administracion)
20. [Atajos de teclado](#20-atajos-de-teclado)
21. [Resolucion de problemas](#21-resolucion-de-problemas)
22. [Apendice A: Prefijos de documentos](#apendice-a-prefijos-de-documentos)
23. [Apendice B: Flujo completo E2E](#apendice-b-flujo-completo-e2e)

---

## 1. Introduccion

### Que es Mocciaro Soft

Mocciaro Soft es un ERP/CRM integral disenado para empresas de distribucion industrial, con foco en herramientas de torque, soldadura, equilibradoras y productos industriales. Cubre todo el ciclo comercial: desde la captacion de un lead hasta el cobro de la factura.

### Para quien esta disenado

- **Vendedores:** gestionan leads, crean cotizaciones, dan seguimiento al pipeline.
- **Administracion:** emiten facturas, controlan cobros, concilian extractos bancarios.
- **Tecnicos SAT:** registran incidencias, completan hojas de mantenimiento, gestionan activos.
- **Gerencia:** ven dashboards ejecutivos, informes financieros y KPIs en tiempo real.
- **Compras:** crean ordenes de compra, reciben albaranes, gestionan proveedores.

### Empresas configuradas 🏢

El sistema opera en modo **multi-empresa**. Las empresas actuales son:

| Codigo | Empresa | Pais | Moneda |
|--------|---------|------|--------|
| TT | TORQUETOOLS SL | Espana | EUR |
| BT | BuscaTools SA | Argentina | ARS |
| TQ | Torquear SA | Argentina | ARS |
| JMJM | JMJM | Argentina | ARS |
| GAS | Global Assembly Solutions LLC | USA | USD |

> **Regla de oro:** Todo en el ERP se filtra por la empresa seleccionada en la barra superior. Si no ves datos, verifica que tengas la empresa correcta activada.

### Requisitos

- Navegador moderno: Chrome 90+, Firefox 90+, Safari 15+, Edge 90+
- Conexion a internet (soporta modo offline parcial via PWA)
- Resolucion minima recomendada: 1280x720 (responsive hasta mobile)

---

## 2. Primer inicio y configuracion

**URL:** `/` (redirige a `/dashboard`)

### 2.1 Login

1. Abri tu navegador y accede a `cotizador-torquetools.vercel.app`.
2. Vas a ver la pantalla de login con el logo naranja "M" de Mocciaro Soft.
3. Hace click en **"Iniciar sesion con Google"**.
4. Selecciona tu cuenta de Google corporativa.
5. Si tu email esta registrado en el sistema, entras directo al Dashboard.
6. Si es tu primer ingreso, el admin ya te tiene que haber creado la cuenta desde Administracion.

> **Nota:** El login se hace con Google OAuth. No hay usuario/contrasena propio del sistema.

### 2.2 Seleccionar empresa activa 🏢

1. Una vez logueado, mira la **barra superior** (TopBar).
2. A la derecha vas a ver el **selector de empresa** (componente CompanySelector).
3. Hace click en el selector.
4. Vas a ver la lista de empresas a las que tenes acceso, cada una con su bandera de pais.
5. Selecciona la empresa con la que queres trabajar.
6. **Modo multi-empresa (admin):** Si sos admin, podes activar varias empresas a la vez. Los datos se muestran combinados.

[Screenshot: Selector de empresa desplegado mostrando TT, BS, TQ, GA con banderas]

> **Importante:** Cuando cambias de empresa, todos los listados, KPIs, cotizaciones, facturas y demas datos se refrescan automaticamente mostrando solo los de la empresa seleccionada.

### 2.3 Navegar por el sistema

- **Sidebar izquierdo:** Menu principal con todos los modulos. Fondo oscuro (#0A0D12), iconos en gris que se iluminan en naranja (#FF6600) cuando estan activos.
- **Barra superior:** Boton de busqueda (Cmd+K), campana de alertas, selector de empresa, avatar del usuario.
- **Mobile:** La sidebar se oculta y aparece una **barra inferior** con los 5 modulos principales (Dashboard, Dashboard Ejecutivo, Hub IA, CRM, Cotizador).
- **Colapsar sidebar:** Hace click en el boton "Contraer" al pie de la sidebar para pasar a modo iconos (72px ancho) y ganar espacio.

[Screenshot: Layout general con sidebar expandida, topbar y area de contenido]

---

## 3. Dashboard principal

**URL:** `/dashboard`
**Sidebar:** Dashboard (icono LayoutDashboard)

### Que vas a ver

El dashboard principal usa un **grid configurable** (react-grid-layout) con widgets que podes mover y reorganizar.

### Paso a paso

1. Hace click en **Dashboard** en la sidebar (primer item).
2. Vas a ver un grid con widgets arrastrables.
3. Los widgets muestran KPIs resumidos de tu operacion.
4. Cada widget tiene datos en tiempo real de la empresa seleccionada.

### Widgets disponibles

| Widget | Que muestra |
|--------|-------------|
| Bienvenida | Saludo personalizado con nombre del usuario |
| Cotizaciones del mes | Cantidad y monto de presupuestos del mes |
| Pipeline CRM | Valor total de oportunidades abiertas |
| Clientes activos | Total de clientes en la base |
| Productos | Total de productos en el catalogo |
| Entregas pendientes | Pedidos sin entregar |
| Facturas pendientes | Facturas emitidas sin cobrar |
| Cobros pendientes | Monto total por cobrar |
| Pagos pendientes | Monto a pagar a proveedores |
| Alertas stock | Productos por debajo del minimo |
| Acciones rapidas | Botones para crear coti, lead, pedido, ticket SAT |
| Actividad reciente | Ultimas acciones en el sistema |
| Cotizaciones recientes | Ultimos presupuestos creados |
| Grafico ventas | Tendencia mensual de ventas |
| Pipeline chart | Funnel del CRM |
| Distribucion marcas | Torta de marcas en catalogo |
| Agenda hoy | Eventos del calendario |
| Progreso entregas | Barra de avance de entregas |

> Cada badge naranja en la sidebar muestra conteos en tiempo real: cotizaciones en borrador, pedidos abiertos, PO pendientes y tickets SAT abiertos. Se refrescan cada 60 segundos.

---

## 4. Dashboard ejecutivo

**URL:** `/dashboard/ejecutivo`
**Sidebar:** Dashboard ejecutivo (icono BarChart3)

### Para que sirve

Es la vista de gerencia. Muestra en una sola pantalla todos los numeros clave del negocio para la empresa activa.

### Paso a paso

1. Hace click en **Dashboard ejecutivo** en la sidebar.
2. Arriba vas a ver el titulo "Dashboard Ejecutivo" con la empresa activa y la fecha.
3. A la derecha hay un boton **Refrescar** para recargar datos.

### 4.1 KPIs principales (fila de 4 tarjetas)

| KPI | Que muestra | Color | Link a |
|-----|-------------|-------|--------|
| Cobrado este mes | Total cobrado en el mes actual + variacion vs mes anterior (↑/↓ %) | Verde | - |
| Por cobrar | Cantidad de facturas pendientes + cuantas estan vencidas | Naranja/Rojo | `/ventas?tab=facturas` |
| Leads HOT | Cantidad de leads calificados como "hot" / total leads | Rojo | `/crm/leads` |
| Pipeline abierto | Oportunidades abiertas + cotizaciones + pedidos | Naranja | `/crm?tab=pipeline` |

4. Cada tarjeta es clickeable y te lleva al modulo correspondiente.

### 4.2 Aging de cuentas por cobrar

5. Debajo de los KPIs, a la izquierda, vas a ver el panel **Aging de cuentas por cobrar**.
6. Muestra 4 columnas: **0-30 dias** (verde), **31-60** (amarillo), **61-90** (naranja), **+90 dias** (rojo).
7. Cada columna muestra el monto total pendiente en esa franja.
8. Hace click en "Ver todas →" para ir a Facturas.

### 4.3 Top 5 clientes del mes

9. A la derecha del aging, vas a ver el panel **Top 5 clientes del mes**.
10. Muestra los 5 clientes con mayor facturacion en el mes, con barras de progreso relativas.
11. Hace click en "Ver todos →" para ir a Clientes.

### 4.4 Flujo de ventas visual

12. Abajo hay una barra horizontal que muestra el **embudo de ventas** de izquierda a derecha:
    **Leads → Hot → Oportunidades → Cotizaciones → Pedidos → Por cobrar → Cobradas mes**
13. Cada paso muestra la cantidad y es clickeable.
14. Las flechas (→) conectan visualmente cada etapa.

### 4.5 Resumen ejecutivo IA 🤖

15. Debajo del flujo hay una tarjeta **DailySummaryCard** generada por inteligencia artificial.
16. Resume automaticamente: que paso hoy, alertas importantes, sugerencias de accion.
17. Se actualiza diariamente.

### 4.6 Accesos rapidos

18. Al final hay una fila de 5 botones rapidos:
    - **Nueva cotizacion** → `/cotizador`
    - **Nuevo lead** → `/crm/leads`
    - **Importar OC** → `/ventas/importar-oc`
    - **Subir extracto** → `/cobros`
    - **Diagnostico** → `/admin/diagnostico`

[Screenshot: Vista del dashboard ejecutivo con KPIs, aging, top clientes y flujo de ventas]

---

## 5. CRM — Gestion comercial

**URL:** `/crm`
**Sidebar:** CRM (icono Target)
**Permisos requeridos:** `view_crm`

### Estructura

La pagina CRM tiene **4 tabs** (pestanas):

| Tab | Icono | Funcion |
|-----|-------|---------|
| Leads IA | Rayo (Zap) | Gestion de leads con scoring IA |
| Pipeline | Diana (Target) | Kanban de oportunidades |
| Actividades | Actividad (Activity) | Log de actividad comercial |
| Informes | Graficos (BarChart3) | Estadisticas del CRM |

---

### 5.1 Tab "Leads IA" 🤖

**URL:** `/crm` (tab por defecto) o `/crm/leads`

#### Que ves

Una tabla con todos los leads capturados, cada uno con su score de IA, temperatura y datos de contacto.

#### Crear un lead manualmente

1. Hace click en el tab **Leads IA**.
2. Hace click en el boton **+ Nuevo Lead** (arriba a la derecha).
3. Se abre un modal con los siguientes campos:
   - **Nombre del contacto** (obligatorio)
   - **Email**
   - **Telefono**
   - **Empresa**
   - **Fuente** (dropdown): Llamada telefonica, Email recibido, WhatsApp, Formulario web, Referido, Feria/Evento, LinkedIn, Visita comercial, Otro
   - **Producto de interes** (dropdown): Atornilladores/Torque, Llaves de torque, Equilibradoras, Soldadura, EPP, Accesorios, SAT, Calibracion, etc.
   - **Urgencia** (dropdown): Baja, Media, Alta, Critica
   - **Mensaje/Contexto** (textarea)
4. Hace click en **Guardar**.

#### Analisis IA del lead 🤖

5. Una vez creado el lead, en la tabla vas a ver una columna de **Score IA**.
6. Hace click en el boton **Analizar** (icono Sparkles) en la fila del lead.
7. La IA analiza el mensaje, la empresa y el producto de interes.
8. Asigna un **score** numerico:

| Score | Significado |
|-------|-------------|
| 0 | Sin analizar |
| 20 | Muy frio — consulta generica |
| 40 | Tibio — interes moderado |
| 60 | Calido — interes claro |
| 80 | Caliente — listo para cotizar |
| 100 | Urgente — quiere comprar ya |

9. La **temperatura** se muestra visualmente:
   - 🔥 **Hot** (score >= 70): fondo rojo
   - 🌡️ **Warm** (score 40-69): fondo amarillo
   - ❄️ **Cold** (score < 40): fondo azul

#### Acciones desde un lead

10. Hace click en **Ver detalle** para abrir el lead completo.
11. Desde el detalle, tenes dos botones clave:
    - **Crear cotizacion** → te lleva al Cotizador con el cliente pre-cargado.
    - **Convertir a oportunidad** → crea una oportunidad en el Pipeline vinculada a este lead.

[Screenshot: Tabla de leads con columnas de score, temperatura y acciones]

---

### 5.2 Tab "Pipeline"

**URL:** `/crm?tab=pipeline`

#### Que ves

Un tablero **Kanban** con columnas por etapa. Las oportunidades se muestran como tarjetas arrastrables.

#### Etapas del pipeline

Las etapas son (de izquierda a derecha):
- **Lead** → **Propuesta** → **Negociacion** → **Ganado** → **Pedido** → **Perdido**

Cada columna muestra: cantidad de oportunidades, valor total, y las tarjetas individuales.

#### Crear nueva oportunidad

1. Hace click en el boton **+ Nueva Oportunidad**.
2. Se abre un modal completo con:
   - **Titulo de la oportunidad** (obligatorio) — ej: "Cotizacion atornilladores FIAM para linea de montaje"
   - **Cliente** — buscador con autocompletado. Si no existe, aparece boton "Nuevo" para crearlo inline.
   - **Valor estimado** + **Moneda** (EUR/USD/ARS)
   - **Canal de origen** — mismas opciones que en leads
   - **Producto de interes** — al seleccionarlo, auto-asigna vendedor por especialidad 🤖
   - **Urgencia** — Baja / Media / Alta / Critica
   - **Vendedor asignado** — dropdown con usuarios activos
   - **Etapa** — Lead, Propuesta, Negociacion, etc.
   - **Probabilidad %** — 0% a 100% (pre-definido)
   - **Fecha cierre esperado**
   - **Notas**
3. Hace click en **Crear Oportunidad**.

#### Drag & drop entre etapas

4. Para mover una oportunidad de etapa, **arrastrala** (drag) desde su tarjeta y **soltala** (drop) sobre la columna destino.
5. Se actualiza automaticamente en la base de datos.
6. Aparece un toast de confirmacion: "Movido a [nueva etapa]".

#### Detalle de oportunidad

7. Hace click en cualquier tarjeta del Kanban.
8. Se abre un modal con:
   - **Barra de proceso** (DocumentProcessBar) mostrando Lead → Propuesta → Negociacion → Ganado → Pedido
   - Datos del cliente (nombre, email, telefono)
   - Campos editables: Valor, Etapa, Probabilidad, Vendedor, Fecha cierre, Canal, Urgencia, Notas
   - Si la etapa es "Perdido", aparece campo adicional **Razon de perdida**
   - Boton **Guardar**
   - Boton **Cotizar** → te lleva al Cotizador con el cliente pre-cargado

#### Filtros

9. Arriba del Kanban hay:
   - **Buscador** — filtra por titulo o nombre de cliente
   - **Dropdown de etapa** — filtra por una etapa especifica
   - **Dropdown de vendedor** — filtra por vendedor asignado
   - **Boton Exportar** — descarga a CSV/Excel

10. Abajo del buscador se muestra: cantidad de oportunidades y **valor ponderado** del pipeline.

[Screenshot: Kanban con 6 columnas, tarjetas con valor, probabilidad y tags]

---

### 5.3 Tab "Actividades"

**URL:** `/crm?tab=actividades`

1. Hace click en el tab **Actividades**.
2. Vas a ver un listado cronologico de las ultimas 50 actividades.
3. Cada actividad muestra:
   - **Tipo** (badge): opportunity, client, quote, sales_order
   - **Accion** realizada
   - **Detalle** descriptivo
   - **Tiempo** relativo ("hace 2 horas")
4. Arriba hay un KPI card con el total de actividades recientes.

[Screenshot: Timeline de actividades con badges de tipo y timestamps]

---

### 5.4 Tab "Informes"

**URL:** `/crm?tab=informes`

1. Hace click en el tab **Informes**.
2. Vas a ver 4 KPI cards:
   - **Total oportunidades**
   - **Ganadas** (verde)
   - **Perdidas** (rojo)
   - **Tasa de conversion** (azul, en %)
3. Debajo hay un grafico de barras: **Valor por etapa del pipeline**.
   - Cada etapa muestra una barra proporcional con su valor total y cantidad.
4. Al final, un KPI grande con el **Valor ponderado del pipeline** (valor * probabilidad).

[Screenshot: KPIs de conversion y grafico de barras del pipeline]

---

## 6. Cotizador

**URL:** `/cotizador`
**Sidebar:** Cotizador (icono FileText)
**Badge:** Muestra cantidad de cotizaciones en borrador
**Permisos:** `create_quote`, `edit_quote`, `view_sales_reports`

### Vista general

El cotizador tiene dos modos (toggle arriba a la derecha):
- **Nueva** (PlusCircle) — crear cotizacion nueva
- **Guardadas** (List) — ver historial de cotizaciones

---

### 6.1 Crear nueva cotizacion

1. Asegurate de estar en el modo **Nueva** (boton naranja arriba).

#### Barra de proceso (stepper)

2. Arriba de todo vas a ver la **DocumentProcessBar** que muestra:
   - El **numero de cotizacion** auto-generado (ej: `COT-2026-0042`)
   - Un **badge** de estado: "Borrador" (amarillo) o "Listo para guardar" (verde)
   - Los **pasos del flujo**: Borrador → Condiciones → Aprobacion → Enviada → Aceptada → Pedido
   - **Alertas** amarillas si falta empresa, cliente, items, condicion de pago o incoterm

#### Seleccionar empresa emisora 🏢

3. En la tarjeta izquierda **Empresa emisora**:
   - Selecciona del dropdown la empresa (solo muestra las visibles segun tu seleccion en el topbar).
   - Al seleccionar empresa, la **moneda** se auto-configura (EUR para Espana, ARS para Argentina).
   - Podes cambiar la moneda manualmente con el selector: EUR / USD / ARS.

#### Buscar y seleccionar cliente

4. En la tarjeta derecha **Cliente**:
   - Escribi en el buscador: nombre, CUIT/CIF, email.
   - Aparece un dropdown con resultados.
   - Hace click en el cliente deseado para seleccionarlo.
   - Si el cliente viene pre-cargado desde un Lead (URL con `?clientId=...`), ya aparece seleccionado.
   - Para quitar el cliente seleccionado, hace click en la **X** roja.

#### Agregar items

5. En la tarjeta **Items de la cotizacion**:
   - Opcion A: **Buscar producto** — Abre un modal de busqueda. Escribi el SKU, nombre o marca. Hace click en el producto para agregarlo como linea.
   - Opcion B: **Linea manual** — Agrega una linea vacia donde podes escribir SKU, descripcion, cantidad, precio unitario, descuento % y notas.

6. Para cada linea podes:
   - Cambiar **cantidad** con botones +/- o tipeando directamente
   - Escribir **precio unitario**
   - Aplicar **descuento %** (0-100)
   - Agregar **notas** por linea
   - **Eliminar** la linea (icono de tacho rojo)

7. El **subtotal** de cada linea se calcula automaticamente: cantidad x precio x (1 - descuento/100).

#### Condiciones

8. Debajo de los items, a la izquierda:
   - **Notas (visible al cliente)** — textarea, aparece en el PDF
   - **Notas internas (solo admin)** — no se muestra al cliente
   - **Incoterm** — dropdown: EXW, FCA, CPT, CIP, DAP, DPU, DDP, FAS, FOB, CFR, CIF
   - **Valido hasta** — fecha (por defecto +30 dias)
   - **Condicion de pago** — dropdown: Contado, Pago anticipado, X dias Fecha Factura, X dias Fecha Vencimiento, X dias Fecha Recepcion, Personalizado
   - Si elegis "X dias...", aparece un campo para ingresar la cantidad de dias
   - Tambien podes editar libremente el texto descriptivo (ej: "50% anticipo + 50% 30d FF")

#### Totales

9. A la derecha vas a ver el panel de totales:
   - **Subtotal** (cantidad de items)
   - **IVA** — porcentaje editable (por defecto 21%) + monto calculado
   - **Total** — en grande, color naranja
   - Botones: **PDF / Imprimir** y **WhatsApp** (comparte un resumen)
   - Boton principal: **Guardar cotizacion**

#### Guardar

10. Hace click en **Guardar cotizacion**.
11. Se crea el registro en `tt_quotes` con todos los items en `tt_quote_items`.
12. Se registra una actividad en el log.
13. Aparece un toast verde: "Cotizacion guardada: COT-2026-XXXX".
14. Los campos se limpian para una nueva cotizacion.

[Screenshot: Cotizador con empresa, cliente, items y totales]

---

### 6.2 Cotizaciones guardadas

1. Hace click en el toggle **Guardadas** (arriba a la derecha).
2. Vas a ver un **DataTable** con columnas:
   - Referencia, Cliente, Titulo/Descripcion, Estado, Fecha, Importe, Moneda
3. La tabla tiene **busqueda**, **ordenamiento por columna**, **paginacion** (25 por pagina) y **exportacion**.
4. Hace click en cualquier fila para ver el **detalle completo** (DocumentForm).

#### Detalle de cotizacion guardada

5. Al abrir el detalle vas a ver:
   - **Barra de trazabilidad** (workflow): Lead → Cotizacion → OC Cliente → Pedido → Albaran → Factura → Cobro
   - **Items** con su arbol de componentes
   - **Datos del documento**: empresa, cliente, moneda, totales
   - **Notas internas**
   - **Acciones**: Editar, Enviar, Convertir a pedido
6. Podes navegar entre cotizaciones con flechas de "anterior/siguiente".

[Screenshot: DataTable de cotizaciones guardadas con busqueda y filtros]

---

## 7. Ventas

**URL:** `/ventas`
**Sidebar:** Pedidos, Importar OC, Albaranes, Facturas (items separados)

### Estructura

La pagina de Ventas tiene **5 tabs**:

| Tab | Icono | Funcion |
|-----|-------|---------|
| Presupuestos | FileText | Cotizaciones migradas de StelOrder |
| Pedidos | ClipboardList | Pedidos de venta (sales orders) |
| Albaranes | Truck | Notas de entrega / delivery notes |
| Facturas | FileCheck | Facturas emitidas |
| Cobros | DollarSign | Pagos recibidos |

---

### 7.1 Pedidos

**URL:** `/ventas?tab=pedidos`
**Sidebar:** Pedidos (icono ClipboardList, badge con pedidos abiertos)

1. Hace click en **Pedidos** en la sidebar.
2. Vas a ver un DataTable con todos los pedidos de venta.
3. Cada pedido tiene estados: Abierto, Entrega parcial, Entregado, Facturacion parcial, Facturado, Cerrado.
4. Hace click en un pedido para ver el detalle.
5. En el detalle, la **barra de trazabilidad** muestra: Cotizacion → Pedido → Albaran → Factura → Cobro.
6. Podes ver los items, stock disponible, y crear albaran o factura desde ahi.

---

### 7.2 Importar OC del cliente 🤖

**URL:** `/ventas/importar-oc`
**Sidebar:** Importar OC (icono FileText)
**Permisos:** `create_order`

1. Hace click en **Importar OC** en la sidebar.
2. Vas a ver la pagina con:
   - **Barra de proceso**: muestra el flujo OC recibida → Parseada → Comparada → Pedido creado
   - Lista de OCs ya importadas
   - Lista de cotizaciones abiertas para comparar

#### Subir PDF de OC

3. Hace click en **Subir OC** (boton con icono Upload).
4. Se abre el modal **OCParserModal**.
5. Arrastra o selecciona el PDF de la orden de compra del cliente.
6. La **IA parsea automaticamente** 🤖 el PDF:
   - Extrae: numero de OC, cliente, items, cantidades, precios, condiciones
   - Detecta el proveedor de IA usado (nombre del servicio)
   - Calcula un **score de confianza** (0-100%)

#### Comparar con cotizacion

7. La IA compara automaticamente la OC con la cotizacion vinculada.
8. Si hay **discrepancias** (diferencias de precio, cantidad, items), se muestran con severidad:
   - 🟢 **Low** — diferencias menores
   - 🟡 **Medium** — requiere revision
   - 🔴 **High** — discrepancia critica

9. Revisas cada discrepancia y decides si continuar.
10. Hace click en **Crear pedido** para convertir la OC en un pedido de venta.

[Screenshot: Modal de importacion de OC con IA parseando PDF y mostrando discrepancias]

---

### 7.3 Albaranes

**URL:** `/ventas?tab=albaranes`
**Sidebar:** Albaranes (icono Truck)

1. Hace click en **Albaranes** en la sidebar.
2. Vas a ver el DataTable con todos los albaranes (delivery notes).
3. Cada albaran muestra: referencia, cliente, estado, fecha, importe.
4. Hace click para ver el detalle con items entregados.
5. Desde un pedido se puede crear un albaran parcial o total.

---

### 7.4 Facturas

**URL:** `/ventas?tab=facturas`
**Sidebar:** Facturas (icono CreditCard)
**Permisos:** `view_financials`, `create_invoice`

1. Hace click en **Facturas** en la sidebar.
2. Vas a ver el DataTable con todas las facturas.
3. Estados posibles: Emitida, Autorizada, Pendiente de cobro, Cobrada, Anulada.

#### Emitir factura

4. Desde un pedido o albaran, hace click en **Emitir factura**.
5. El sistema genera la factura con todos los datos pre-completados.

#### Flujo por empresa 🏢

- **Argentina (TQ):** La factura se envia a **Tango via API** para su autorizacion con AFIP.
- **Espana (TT/BS):** Se genera localmente y se puede subir a SII manualmente.
- **USA:** Se genera como invoice standard.

#### Nota credito / Nota debito

6. Desde el detalle de una factura, podes generar:
   - **Nota de credito (NC)** — anula total o parcialmente la factura
   - **Nota de debito (ND)** — ajuste por diferencia de precio o cargos adicionales

---

### 7.5 Cobros 🤖

**URL:** `/cobros`
**Sidebar:** Cobros (icono Banknote)
**Permisos:** `view_financials`

#### Que ves

Pantalla de conciliacion bancaria con IA. KPIs arriba: Facturas pendientes, Cobrado este mes, Extractos cargados.

#### Subir extracto bancario

1. Hace click en **Subir extracto** (boton + azul arriba a la derecha).
2. Se abre el componente **BankStatementUploader**.
3. Subi el PDF del extracto bancario.
4. La **IA parsea automaticamente** 🤖 el extracto:
   - Detecta: banco, cuenta, moneda, periodo, saldo inicial/final
   - Extrae cada linea (movimientos)
   - **Matchea automaticamente** cada movimiento con facturas pendientes

#### Confirmar/rechazar matches

5. Una vez procesado, se muestra la lista de movimientos con sus matches propuestos.
6. Cada match muestra: factura vinculada, monto, confianza del match.
7. Hace click en **Confirmar** (check verde) para aceptar un match.
8. Hace click en **Rechazar** (X roja) para rechazar y buscar manualmente.

#### Detalle por extracto

9. Hace click en cualquier extracto de la lista para ver el detalle completo.
10. Vas a `/cobros/[id]` con todas las lineas y sus estados.

[Screenshot: Pantalla de cobros con KPIs, extractos procesados y matches IA]

---

## 8. Compras

**URL:** `/compras?tab=pedidos`
**Sidebar:** Compras (icono ShoppingCart, badge con POs pendientes)
**Permisos:** `create_purchase_order`, `view_suppliers`

### Estructura

La pagina de Compras tiene multiples tabs para gestionar todo el ciclo de compra.

### 8.1 Pedidos de compra

1. Hace click en **Compras** en la sidebar.
2. Vas a ver el DataTable con pedidos de compra (purchase orders).
3. Hace click en **+ Nuevo** para crear un pedido de compra.
4. Selecciona proveedor, agrega items, define condiciones.
5. El flujo de estados es: Borrador → Enviado → Parcial → Recibido → Cerrado.

### 8.2 Albaranes de compra

6. Cuando recibi mercaderia, crea el albaran de compra desde el pedido.
7. El stock se actualiza automaticamente al confirmar la recepcion.

### 8.3 Facturas de compra

8. Las facturas de compra se registran para control contable.
9. Se pueden cruzar con los extractos bancarios en Cobros para conciliacion de pagos.

### 8.4 Proveedores

**URL:** `/compras?tab=proveedores`
**Sidebar:** Proveedores (icono Building2)

1. En la sidebar, hace click en **Proveedores**.
2. Vas a ver la lista de proveedores con datos de contacto, pais, condiciones.
3. Hace click en un proveedor para ver: contactos, pedidos asociados, facturas, pagos.
4. Podes crear, editar y gestionar contactos del proveedor.

[Screenshot: DataTable de pedidos de compra con estados y filtros]

---

## 9. Finanzas

**URL:** `/finanzas`
**Sidebar:** Finanzas (icono TrendingUp)
**Permisos:** `view_financials`

### Estructura

La pagina de Finanzas tiene 3 secciones principales en tabs.

### 9.1 Tipos de cambio

1. Hace click en **Finanzas** en la sidebar.
2. La primera seccion muestra los **tipos de cambio** actualizados:
   - Dolar Oficial (AR)
   - Dolar Blue (AR)
   - Dolar MEP (AR)
   - Dolar CCL (AR)
   - Euro (EUR/USD)
3. Los datos se obtienen de APIs externas y se guardan en `tt_fx_rates`.

### 9.2 Aging report con sugerencias IA 🤖

4. La seccion de **Aging** muestra un reporte detallado por cliente:
   - **Nombre del cliente**
   - Facturas pendientes agrupadas por **bucket**: 0-30 dias, 31-60, 61-90, +90
   - **Total adeudado**
   - **Dias maximo de mora**
   - **Ultimo pago** recibido
   - **Sugerencia IA** 🤖 — texto generado con recomendacion de accion (ej: "Llamar, lleva 45 dias", "Enviar mail recordatorio")

### 9.3 Cash flow forecast 30/60/90 dias 🤖

5. La seccion de **Cash Flow** muestra proyeccion de flujo de caja:
   - **Saldo apertura**
   - **Ingresos estimados** (facturas por cobrar + probables)
   - **Egresos estimados** (compras + gastos recurrentes)
   - **Flujo neto**
   - **Saldo proyectado** al final del periodo
   - **Semanas en negativo** (si hay)
   - **Saldo minimo** proyectado y en que semana
   - Tabla semanal con inflow, outflow, neto y saldo acumulado

[Screenshot: Finanzas con tipos de cambio, aging por cliente y cash flow]

---

## 10. Stock

**URL:** `/stock`
**Sidebar:** Stock (icono Warehouse)
**Permisos:** `view_stock`

### Que ves

Pantalla completa de gestion de inventario con tabs.

### 10.1 Inventario

1. Hace click en **Stock** en la sidebar.
2. Vas a ver el DataTable con todos los productos en stock:
   - SKU, Nombre, Marca, Almacen, Cantidad, Reservado, Minimo
3. Indicadores visuales:
   - 🟢 Stock OK (cantidad > minimo)
   - 🟡 Stock bajo (cantidad cerca del minimo)
   - 🔴 Sin stock o agotado

### 10.2 Movimientos

4. En el tab de Movimientos, vas a ver el historial de entradas y salidas:
   - Tipo de movimiento: Entrada, Salida, Ajuste, Transferencia
   - Producto, Almacen, Cantidad antes → despues
   - Referencia (pedido, albaran, ajuste manual)
   - Fecha y quien lo hizo

### 10.3 Almacenes

5. En el tab de Almacenes, gestionas los depositos/almacenes:
   - Nombre, Codigo, Ubicacion
   - Podes crear nuevos almacenes

### 10.4 Importar / Exportar

6. Boton **Exportar** — descarga el stock a CSV/Excel.
7. Boton **Importar** — permite subir un archivo CSV para actualizar stock masivamente.

[Screenshot: Stock con tabla de inventario, indicadores de nivel y movimientos]

---

## 11. Clientes

**URL:** `/clientes`
**Sidebar:** Clientes (icono Users)
**Permisos:** `view_clients`

### Estructura (6 tabs)

| Tab | Funcion |
|-----|---------|
| Clientes | Lista principal con DataTable |
| Favoritos | Clientes marcados con estrella |
| Ranking | Top clientes por facturacion |
| Potenciales | Clientes categoria "potential" |
| Contactos | Personas de contacto asociadas |
| Duplicados | Deteccion y merge de duplicados |

### 11.1 Lista de clientes

1. Hace click en **Clientes** en la sidebar.
2. Vas a ver el DataTable con: Nombre, Razon social, CIF/CUIT, Email, Telefono, Pais (con bandera), Categoria.
3. Busca por nombre, razon social, CIF/CUIT o email.
4. Hace click en un cliente para ver el detalle.

### 11.2 Detalle del cliente

5. En el detalle vas a ver:
   - Datos generales: nombre, razon social, CIF, email, telefono, direccion, pais
   - **Contactos** asociados (personas de la empresa)
   - **Empresas relacionadas** (RelatedCompanies)
   - **Historial de documentos** vinculados (cotizaciones, pedidos, facturas)
   - **Log de actividad**
   - Botones: Editar, Marcar favorito, WhatsApp, Email, Telefono
   - Vinculo a la ficha de StelOrder (si fue migrado)

### 11.3 Crear cliente

6. Hace click en **+ Nuevo cliente**.
7. Completa los campos: nombre, razon social, CIF/CUIT, email, telefono, direccion, pais, categoria, condicion de pago, limite de credito.
8. Hace click en **Guardar**.

### 11.4 Merge de duplicados

9. En el tab **Duplicados** se detectan automaticamente clientes con datos similares.
10. Podes seleccionar dos clientes y hacer **merge** (componente ClientMerge).
11. Se unifican todos los documentos bajo un solo registro.

### 11.5 Sincronizar contactos

12. El boton **SyncContactsButton** permite sincronizar contactos con fuentes externas.

[Screenshot: Ficha de cliente con datos, contactos, historial y acciones]

---

## 12. Catalogo

**URL:** `/catalogo`
**Sidebar:** Catalogo (icono Package)
**Permisos:** `view_catalog`

### Que ves

El catalogo completo de productos con dos modos de visualizacion: **Grilla** (Grid3X3) y **Lista** (List).

### 12.1 Buscar productos

1. Hace click en **Catalogo** en la sidebar.
2. Usa el **buscador** para filtrar por SKU, nombre, marca, categoria.
3. Filtra por: Marca, Categoria, Subcategoria, Rango de precio.
4. Ordena por: Nombre, SKU, Precio, Marca.

### 12.2 Detalle del producto

5. Hace click en un producto para ver:
   - Imagen del producto
   - SKU, Nombre, Marca, Categoria, Subcategoria
   - **Precio EUR**, Costo EUR
   - Especificaciones tecnicas: Torque min/max, RPM, Encastre, Peso, Serie, Modelo, Origen
   - Stock disponible por almacen
   - Historial de precios

### 12.3 Importar / Exportar

6. **Exportar** — descarga todo el catalogo a CSV/Excel.
7. **Importar** — subi un CSV para actualizar precios, agregar productos, etc.
8. **Crear producto** — boton + para agregar un producto manualmente.

[Screenshot: Catalogo en modo grilla con imagenes, precios y filtros por marca]

---

## 13. Proveedores

**URL:** `/compras?tab=proveedores`
**Sidebar:** Proveedores (icono Building2)
**Permisos:** `view_suppliers`

(Ver seccion 8.4 para detalle completo)

La gestion de proveedores incluye:
- Lista con DataTable (nombre, contacto, pais, telefono, email)
- Detalle con contactos, pedidos de compra, facturas, pagos
- Creacion y edicion de proveedores
- Gestion de contactos del proveedor

---

## 14. SAT — Servicio tecnico

**URL:** `/sat`
**Sidebar:** SAT (icono Wrench, badge con tickets abiertos)
**Permisos:** `view_sat`

### Estructura principal (4 tabs)

| Tab | Funcion |
|-----|---------|
| Incidencias | Tickets de soporte tecnico |
| Hojas activas | Workflows de mantenimiento en curso |
| Ordenes de trabajo | Ordenes asignadas a tecnicos |
| Activos/Equipos | Registro de equipos del cliente |

### Sub-paginas en la sidebar (se expanden al entrar en /sat)

Cuando estas en SAT, la sidebar muestra sub-items:
- **Activos** (`/sat/activos`) — Equipos registrados
- **Hojas** (`/sat/hojas`) — Hojas de mantenimiento
- **Repuestos** (`/sat/repuestos`) — Stock de repuestos SAT
- **Modelos** (`/sat/modelos`) — Modelos de equipos
- **Manuales** (`/sat/manuales`) — Documentacion tecnica
- **Lotes** (`/sat/lotes`) — Gestion de lotes
- **Pausadas** (`/sat/pausadas`) — Hojas en pausa
- **Historico** (`/sat/historico`) — Historial completo

### 14.1 Incidencias (Tickets)

1. Hace click en **SAT** en la sidebar → tab **Incidencias**.
2. Vas a ver la tabla de tickets con:
   - Numero, Cliente, Descripcion, Estado, Prioridad, Fecha
3. **Estados:** Abierto (azul), En progreso (amarillo), Esperando repuestos (naranja), Resuelto (verde), Cerrado (gris)
4. **Prioridades:** Baja (gris), Normal (verde), Alta (amarillo), Urgente (rojo)

#### Crear ticket

5. Hace click en **+ Nueva incidencia**.
6. Completa: Cliente (combobox con busqueda), Equipo/Activo, Descripcion, Prioridad.
7. Guarda el ticket.

### 14.2 Hojas de mantenimiento (Workflow de 5 pasos)

**URL:** `/sat/hojas` y `/sat/hojas/[ntt]`

1. Hace click en **Hojas** en el sub-menu de SAT.
2. Las hojas de mantenimiento siguen un **workflow de 5 pasos**:

| Paso | Nombre | Que se hace |
|------|--------|-------------|
| 1 | Recepcion | Registrar ingreso del equipo, datos del cliente, fotos |
| 2 | Diagnostico | Evaluar el equipo, describir el problema. Soporte voice-to-text 🤖🎤 |
| 3 | Presupuesto | Crear presupuesto de reparacion con repuestos y mano de obra |
| 4 | Reparacion | Registrar trabajos realizados, repuestos usados |
| 5 | Entrega | Confirmar entrega al cliente, firma, fotos finales |

3. Cada paso tiene su propio formulario y podes avanzar/retroceder.
4. El **SATWorkflow** component gestiona la transicion entre pasos.

### 14.3 Voice-to-text en diagnostico 🤖🎤

5. En el paso 2 (Diagnostico), hay un boton de **microfono**.
6. Hace click, habla, y la IA transcribe tu voz a texto automaticamente.
7. Esto acelera el registro de diagnosticos en taller.

### 14.4 Activos

**URL:** `/sat/activos`

1. Lista de equipos/activos registrados.
2. Cada activo tiene: Modelo, Numero de serie, Cliente, Fecha de compra, Estado.
3. Hace click para ver el historial de mantenimientos del equipo.

### 14.5 Historico

**URL:** `/sat/historico`

1. Historial completo de todas las hojas de mantenimiento.
2. Podes buscar por NTT (numero de trabajo tecnico).
3. Cada registro se puede exportar a **PDF** (`/sat/historico/[id]/pdf`).

[Screenshot: SAT con tabs de incidencias, workflow de 5 pasos y voice-to-text]

---

## 15. Gastos

**URL:** `/gastos`
**Sidebar:** Gastos (icono Receipt)
**Permisos:** `view_financials`

### Que ves

Pantalla de gestion de gastos con scanner OCR integrado.

### 15.1 Scanner OCR de tickets/recibos 🤖

1. Hace click en **Gastos** en la sidebar.
2. Alterna entre dos vistas: **Lista** y **Scanner**.
3. Hace click en **+ Nuevo gasto** o cambia a modo **Scanner**.
4. Se abre el componente **ReceiptScanner**.
5. Saca una foto o subi una imagen del ticket/recibo.
6. La **IA extrae automaticamente** 🤖:
   - Proveedor
   - Tipo de comprobante
   - CUIT/CIF del emisor
   - Monto total, subtotal, IVA
   - Fecha
   - Numero de factura/ticket
7. Los datos se pre-completan en el formulario de gasto.
8. Revisas, ajustas si hace falta, y guardas.

### 15.2 Lista de gastos

9. En la vista **Lista** ves todos los gastos registrados:
   - Numero, Descripcion, Proveedor, Tipo, Total, Moneda, Fecha, Estado
10. Cada gasto tiene su **DocumentProcessBar** mostrando el flujo.
11. Total del mes se calcula automaticamente.

[Screenshot: Scanner OCR capturando ticket con datos extraidos por IA]

---

## 16. Hub IA

**URL:** `/ai-hub`
**Sidebar:** Hub IA (icono Sparkles)

### Que ves

Un centro de inteligencia artificial con multiples proveedores.

### 16.1 Mocciaro IA (chat con datos del ERP) 🤖

1. Hace click en **Hub IA** en la sidebar.
2. El proveedor por defecto es **Mocciaro IA** (icono naranja 🟠).
3. Este es el asistente que tiene **acceso a todos los datos del ERP**: leads, facturas, stock, clientes, etc.
4. Escribi tu consulta en el chat. Ejemplos:
   - "Cuanto facturamos este mes?"
   - "Que leads HOT tenemos sin cotizacion?"
   - "Cual es el stock de atornilladores FIAM?"
   - "Quien nos debe mas de 90 dias?"
5. Presiona **Enter** o el boton de enviar.

### 16.2 Modo voz 🎤

6. Hace click en el boton de **microfono** (icono Volume2).
7. Habla tu consulta en voz alta.
8. La IA transcribe y responde.
9. Toggle **Voz ON/OFF** para activar/desactivar respuestas habladas (text-to-speech).

### 16.3 Otros proveedores (iframe)

10. Arriba del chat hay un selector de proveedores:

| Proveedor | Icono | Tipo | Datos ERP |
|-----------|-------|------|-----------|
| Mocciaro IA | 🟠 | API | Si |
| Google Gemini | 🟣 | iframe | No |
| Microsoft Copilot | 🔵 | iframe | No |
| ChatGPT | 🟢 | iframe | No |
| Perplexity | 🔷 | iframe | No |
| Claude | 🟤 | iframe | No |

11. Al seleccionar Gemini, Copilot, ChatGPT, Perplexity o Claude, se abre un **iframe** con el servicio.
12. Estos servicios **no tienen acceso a los datos del ERP** — solo el Mocciaro IA lo tiene.

[Screenshot: Hub IA con chat de Mocciaro IA y selector de proveedores]

---

## 17. Herramientas transversales

Estas herramientas estan disponibles en **todas las pantallas** del ERP.

---

### 17.1 Buscador rapido (Cmd+K)

1. Presiona **Cmd+K** (Mac) o **Ctrl+K** (Windows) desde cualquier pantalla.
2. O hace click en el boton **"Buscar ⌘K"** en la barra superior.
3. Se abre el **CommandPalette** — un modal de busqueda universal.
4. Escribi lo que buscas: nombre de pagina, cliente, numero de documento, producto.
5. Los resultados aparecen al instante.
6. Presiona **Enter** o hace click para navegar al resultado.

[Screenshot: Command Palette abierta con resultados de busqueda]

---

### 17.2 Alertas (campana)

1. En la barra superior, hace click en la **campana** (icono Bell, componente AlertsBell).
2. Se despliega un panel con notificaciones:
   - Facturas vencidas
   - Leads sin atender
   - Pedidos sin confirmar
   - Stock bajo minimo
3. Cada alerta tiene un link al item correspondiente.

---

### 17.3 Chat IA flotante (boton Sparkles)

1. En la esquina inferior derecha hay un boton flotante con icono **Sparkles** (✨).
2. Hace click para abrir el **AIAssistant** — un chat IA rapido sin salir de la pantalla actual.
3. Escribi tu consulta y obtene respuestas instantaneas.
4. Cerrar con la X para volver a lo que estabas haciendo.

---

### 17.4 Barra de proceso (DocumentProcessBar)

Aparece en el **detalle de cada documento** (cotizacion, pedido, factura, etc.).

Muestra:
- **Codigo** del documento (ej: COT-2026-0042)
- **Badge** de estado con color
- **Entidad** (empresa + cliente + monto)
- **Pasos del workflow** — stepper visual con estado de cada paso
- **Alertas** si faltan datos o hay problemas
- **Botones de accion** (Guardar, Enviar, Convertir)

---

### 17.5 Cadena de trazabilidad

Cada documento muestra su **workflow completo** de trazabilidad:
```
Lead → Oportunidad → Cotizacion → OC Cliente → Pedido → Albaran → Factura → Cobro
```

En cada paso podes ver:
- Si esta completado (check verde), activo (naranja), pendiente (gris)
- Referencia del documento vinculado
- Fecha
- Click para navegar al documento

---

### 17.6 Generacion de PDFs con branding

- Desde cualquier documento (cotizacion, factura, albaran), boton **PDF / Imprimir**.
- Se genera un PDF con el branding de la empresa activa.
- Podes imprimirlo o descargarlo.

---

### 17.7 Portal del cliente

**URL:** `/portal`

- Pagina publica donde los clientes pueden ver sus documentos.
- Acceso con link unico (sin necesidad de login).
- Pueden ver cotizaciones, pedidos, facturas y estados.

---

### 17.8 Formularios publicos

**URL:** `/forms`

- Formularios web que los clientes pueden completar (solicitudes, consultas).
- Los datos se convierten automaticamente en leads en el CRM.

---

### 17.9 Secuencias de email

**URL:** `/crm/sequences`

- Flujos automatizados de emails para seguimiento comercial.
- Configuracion de cadencia, templates y condiciones.

---

### 17.10 Scanner de codigo de barras

**URL:** `/scanner`

1. Accede a la pagina de Scanner.
2. Usa la camara del dispositivo para escanear codigos de barras.
3. Se busca automaticamente el producto en el catalogo.
4. Util para inventario rapido y picking.

---

### 17.11 Modo offline / PWA

- Mocciaro Soft funciona como **Progressive Web App** (PWA).
- Podes instalarlo en tu dispositivo desde el navegador.
- En la barra superior, el componente **SyncStatus** muestra:
  - 🟢 Conectado — datos sincronizados
  - 🟡 Sincronizando — enviando cambios pendientes
  - 🔴 Sin conexion — modo offline, los cambios se guardan localmente
- Cuando vuelve la conexion, se sincroniza automaticamente.

---

## 18. Informes

**URL:** `/informes`
**Sidebar:** Informes (icono BarChart3)
**Permisos:** `view_sales_reports`, `view_financials`

### Estructura (7 tabs)

| Tab | Icono | Contenido |
|-----|-------|-----------|
| Resumen | PieChart | KPIs generales del periodo |
| Resultados | TrendingUp | Ingresos vs gastos, resultado neto |
| Facturacion | CreditCard | Detalle de facturacion por periodo |
| Tesoreria | Wallet | Estado de caja y flujo |
| Ventas | FileText | Ventas por cliente, producto, vendedor |
| Rentabilidad | BarChart3 | Margenes por producto y cliente |
| Stock | Package | Valoracion de inventario |

### 18.1 Filtros

1. Hace click en **Informes** en la sidebar.
2. Arriba de todo hay un selector de **periodo**:
   - Este mes, Este trimestre, Este semestre, Este ano, Ano anterior, Todo
3. Los datos se recalculan segun el periodo seleccionado.

### 18.2 Resumen

4. En el tab **Resumen** vas a ver KPIs principales:
   - Total facturado, Total cobrado, Total gastos, Resultado neto
   - Comparacion vs periodo anterior (↑/↓ %)

### 18.3 Facturacion

5. El tab **Facturacion** muestra:
   - DataTable con todas las facturas del periodo
   - Totales por estado (emitida, cobrada, anulada)
   - Agrupacion por mes

### 18.4 Rentabilidad

6. El tab **Rentabilidad** muestra:
   - Margen por producto (precio venta - costo)
   - Rentabilidad por cliente
   - Comparativa entre periodos

[Screenshot: Informes con tabs, KPIs y graficos de facturacion]

---

## 19. Administracion

**URL:** `/admin`
**Sidebar:** Admin (icono Settings)
**Permisos:** `admin_users`

### 19.1 Gestion de usuarios y roles

1. Hace click en **Admin** en la sidebar.
2. Vas a ver la lista de usuarios del sistema con tabs:
   - **Usuarios** — lista con nombre, email, rol, estado (activo/inactivo)
   - **Roles** — sistema RBAC (Role-Based Access Control)
   - **Empresas** — configuracion de empresas
   - **Almacenes** — gestion de depositos

#### Crear usuario

3. Hace click en **+ Nuevo usuario**.
4. Completa los campos:
   - **Username** y **Nombre completo**
   - **Email** (debe coincidir con la cuenta Google para el login)
   - **Rol legacy** (Admin, Vendedor, Tecnico, Solo lectura)
   - **Gmail** (cuenta corporativa)
   - **Email personal**
   - **WhatsApp** y **WhatsApp empresa**
   - **Telefono**
   - **Empresas asignadas** (multi-select: el usuario solo ve datos de las empresas que tiene asignadas)
   - **Especialidades** (para auto-asignacion del CRM)
   - **Roles RBAC** (sistema granular de 25 roles)
   - **Equipos** (agrupacion de trabajo)
   - **Activo** (toggle para activar/desactivar el acceso)
5. Hace click en **Guardar**.

#### Roles y permisos

Los roles se componen de permisos individuales:

| Permiso | Permite |
|---------|---------|
| `view_crm` | Ver modulo CRM |
| `create_quote` | Crear cotizaciones |
| `edit_quote` | Editar cotizaciones |
| `create_order` | Crear pedidos |
| `approve_order` | Aprobar pedidos |
| `view_financials` | Ver facturas, cobros, finanzas |
| `create_invoice` | Emitir facturas |
| `view_stock` | Ver inventario |
| `view_catalog` | Ver catalogo de productos |
| `view_clients` | Ver clientes |
| `view_suppliers` | Ver proveedores |
| `view_sat` | Ver servicio tecnico |
| `view_sales_reports` | Ver informes de ventas |
| `create_purchase_order` | Crear ordenes de compra |
| `admin_users` | Administrar usuarios y configuracion |

#### Especialidades (para auto-asignacion)

Cada vendedor puede tener asignadas **especialidades** que permiten la auto-asignacion de leads:
- Torque (atornilladores, torquimetros)
- Ingenieria / Produccion
- EPP / Seguridad Industrial
- Comercio Electronico
- Logistica / Envios
- Administracion
- Servicio Tecnico (SAT)
- Calibracion
- Ve todo (Admin)

---

### 19.2 Diagnostico del sistema

**URL:** `/admin/diagnostico`

1. Hace click en **Admin** → **Diagnostico**.
2. El sistema ejecuta automaticamente una **verificacion completa** de salud:
   - Conexion a Supabase
   - Tablas principales existentes
   - Datos de empresas configuradas
   - Cadena de ventas (quotes → orders → invoices)
   - Conteos de registros por tabla

3. Cada check muestra:
   - ✅ OK (verde) — todo bien
   - ❌ Error (rojo) — problema detectado con detalle

4. Boton **Refrescar** para re-ejecutar los checks.

[Screenshot: Diagnostico con checks verdes/rojos y conteos de registros]

---

### 19.3 Migracion desde StelOrder

**URL:** `/admin/migration`

1. Herramienta para importar datos desde StelOrder (ERP anterior).
2. Migra: clientes, productos, cotizaciones, pedidos, facturas, proveedores.
3. Mapea los IDs y mantiene la trazabilidad al registro original.

---

## 20. Atajos de teclado

| Atajo | Accion |
|-------|--------|
| `Cmd+K` / `Ctrl+K` | Abrir buscador universal (CommandPalette) |
| `Enter` | Enviar mensaje en chat IA |
| `Esc` | Cerrar modal abierto |
| `Cmd+P` / `Ctrl+P` | Imprimir / Generar PDF (en detalle de documento) |

---

## 21. Resolucion de problemas

### "Sin conexion — modo offline"

- **Causa:** Perdida de conexion a internet.
- **Que hacer:** Los cambios se guardan localmente. Cuando vuelva la conexion, se sincronizan automaticamente. Verifica el indicador **SyncStatus** en la barra superior.

### "La IA no responde"

- **Causa:** Cuota de API agotada o error del servicio.
- **Que hacer:** Espera unos minutos y reintenta. Si persiste, contacta al administrador. Los proveedores externos (Gemini, ChatGPT, etc.) no dependen de la cuota del ERP.

### "No veo mis empresas en el selector"

- **Causa:** Tu usuario no tiene empresas asignadas.
- **Que hacer:** Pedi al administrador que te asigne las empresas desde Admin → Usuarios.

### "El documento no tiene codigo"

- **Causa:** El documento es un borrador que aun no se guardo.
- **Que hacer:** Guarda el documento. El codigo (COT-2026-XXXX, PED-2026-XXXX, etc.) se genera automaticamente al guardar.

### "No puedo ver cierto modulo"

- **Causa:** Tu rol no tiene los permisos necesarios.
- **Que hacer:** Pedi al administrador que revise tus permisos en Admin → Usuarios → Roles.

### "Los datos no coinciden con StelOrder"

- **Causa:** La migracion puede tener diferencias por mapeo de campos.
- **Que hacer:** Usa el Diagnostico (`/admin/diagnostico`) para verificar la integridad de datos. Reporta discrepancias al administrador.

---

## Apendice A: Prefijos de documentos

| Prefijo | Tipo de documento | Tabla principal |
|---------|-------------------|-----------------|
| COT | Cotizacion / Presupuesto | `tt_quotes` |
| PED | Pedido de venta (Sales Order) | `tt_sales_orders` / `tt_documents` |
| ALB | Albaran / Nota de entrega | `tt_documents` (type: albaran) |
| FAC | Factura | `tt_documents` (type: factura) |
| NC | Nota de credito | `tt_documents` (type: nota_credito) |
| ND | Nota de debito | `tt_documents` (type: nota_debito) |
| OC | Orden de compra (del cliente) | `tt_client_purchase_orders` |
| PCK | Packing list | `tt_documents` |
| REM | Remito | `tt_documents` |
| REC | Recibo de cobro | `tt_bank_statement_lines` |
| GAS | Gasto | `tt_documents` (type: gasto) |
| LEAD | Lead comercial | `tt_leads` |
| OPP | Oportunidad comercial | `tt_opportunities` |
| NTT | Numero de trabajo tecnico (SAT) | `tt_sat_tickets` |
| PC | Pedido de compra (a proveedor) | `tt_purchase_orders` |

---

## Apendice B: Flujo completo E2E (ejemplo real)

### Caso: Karin Leyva / ME Elecmetal — Compra de atornilladores de torque

Este ejemplo recorre **todo el flujo del ERP** de punta a punta.

---

#### Paso 1: Llega el lead

1. Karin Leyva de ME Elecmetal envia un email consultando por atornilladores de torque controlado para su linea de montaje.
2. Vas a **CRM → Leads IA** y haces click en **+ Nuevo Lead**.
3. Completas:
   - Nombre: Karin Leyva
   - Empresa: ME Elecmetal
   - Email: kleyva@elecmetal.com
   - Fuente: Email recibido
   - Producto de interes: Atornilladores / Torque
   - Urgencia: Alta
   - Mensaje: "Necesitamos 15 atornilladores FIAM para linea de ensamble, presupuesto urgente"
4. Guardas el lead.
5. Haces click en **Analizar** 🤖 → Score: 80 → Temperatura: 🔥 HOT

#### Paso 2: Convertir a oportunidad

6. Desde el detalle del lead, haces click en **Convertir a oportunidad**.
7. Se crea la oportunidad "Cotizacion atornilladores FIAM para ME Elecmetal".
8. Se auto-asigna al vendedor especialista en torque 🤖.

#### Paso 3: Crear cotizacion

9. Desde la oportunidad, haces click en **Cotizar**.
10. Se abre el Cotizador con cliente pre-cargado.
11. Seleccionas empresa emisora: TORQUETOOLS SL.
12. Buscas producto "FIAM" → agregas 15 unidades del modelo seleccionado.
13. Configuras: Incoterm EXW, Pago 30 dias FF, Validez 30 dias.
14. Guardas: COT-2026-0042.

#### Paso 4: Cliente envia OC

15. Karin acepta la cotizacion y envia su Orden de Compra (PDF).
16. Vas a **Importar OC** → subis el PDF.
17. La IA parsea la OC 🤖 y la compara con COT-2026-0042.
18. No hay discrepancias → haces click en **Crear pedido**.
19. Se crea PED-2026-0089.

#### Paso 5: Entrega

20. Preparas la mercaderia.
21. Desde el pedido, creas el **Albaran** ALB-2026-0067.
22. El stock se descuenta automaticamente.

#### Paso 6: Facturacion

23. Desde el albaran, emitis la **Factura** FAC-2026-0123.
24. Como es TORQUETOOLS SL (Espana), la factura se genera localmente.

#### Paso 7: Cobro

25. A los 30 dias, el banco notifica el pago.
26. Vas a **Cobros** → subis el extracto bancario.
27. La IA matchea automaticamente 🤖 el movimiento con FAC-2026-0123.
28. Confirmas el match → factura marcada como **Cobrada**.

#### Paso 8: Verificacion en Dashboard Ejecutivo

29. Vas al **Dashboard Ejecutivo**.
30. Verificas que ME Elecmetal aparece en **Top 5 clientes del mes**.
31. El **Flujo de ventas** muestra el progreso completo.
32. El **Aging** ya no tiene esa factura pendiente.

---

**Trazabilidad completa:**
```
LEAD-xxx → OPP-xxx → COT-2026-0042 → OC-ME-2026 → PED-2026-0089 → ALB-2026-0067 → FAC-2026-0123 → REC-banco
```

Cada documento enlaza al siguiente y al anterior. Desde cualquier punto de la cadena podes ver el flujo completo en la **barra de trazabilidad**.

---

> **Fin del manual.** Para consultas o reportar errores, contacta a soporte@mocciarosoft.com o usa el **Chat IA flotante** (✨) desde cualquier pantalla del ERP.
