# StelOrder — Mapeo completo de menús y categorías

Capturado en vivo desde `app.stelorder.com` (cuenta TORQUETOOLS, plan Business).
Fecha: 2026-05-13.

---

## 1. Top Nav (barra negra horizontal)

Orden exacto de izquierda a derecha, hash route entre paréntesis:

| # | Label | Hash route |
|---|-------|------------|
| 1 | Inicio | `#main_inicio` |
| 2 | Catálogo | `#main_catalogo` |
| 3 | Clientes | `#main_clientes` |
| 4 | Ventas | `#main_ventas` |
| 5 | SAT | `#main_mantenimientos` |
| 6 | Proyectos | `#main_proyectos` |
| 7 | Facturación | `#main_facturacion` |
| 8 | Compras | `#main_gastosycompras` |
| 9 | Agenda | `#main_agenda` |
| 10 | Informes | `#main_informes` |
| — | Icono grilla (Más funcionalidades) | abre dropdown |
| — | Botón azul "Club Amigo" | invitar amigos |
| — | Avatar + nombre usuario + chevron | dropdown de cuenta |

Item activo: fondo naranja `#FF6600` completo, texto blanco.
Hover: leve tinte gris oscuro.
Tipografía: bold, ~13-14px.
Altura barra: ~50-56px, fondo negro `#0F0F0F`.

---

## 2. Sub-menús (sidebar lateral izquierda contextual)

### 2.1 Inicio
**Sin sub-menú lateral.** Página directa con widgets:
- Header con logo cliente (TORQUETOOLS) + "Vídeos y tutoriales" + "¿Necesitas ayuda?"
- Botones "Pendiente" / "Reciente" toggle (orange/white)
- Botón "Nuevo +" arriba a la derecha
- 4 cards de resumen: **Ventas** (Presupuestos, Pedidos, Albaranes de venta), **SAT** (Mis incidencias, Incidencias sin asignar, Presupuestos, Pedidos, Albaranes), **Facturación** (Facturas, Facturas de abono), **Compras** (Pedidos, Albaranes de proveedor, Facturas)
- Panel inferior: **Tus próximos eventos** + **Documentos creados en los últimos 30 días**

### 2.2 Catálogo
- Productos
- Servicios
- Gastos e inversiones
- Activos en clientes

### 2.3 Clientes
- Clientes
- Clientes potenciales
- Personas de contacto

### 2.4 Ventas
- Presupuestos
- Pedidos
- Albaranes de venta

### 2.5 SAT
- Incidencias
- Presupuestos
- Pedidos de trabajo
- Albaranes de trabajo

### 2.6 Proyectos
- Proyectos *(único sub-item)*

### 2.7 Facturación
- Facturas
- Recibos de facturas
- Facturas de abono
- Recibos de abono
- Libro de facturas emitidas

### 2.8 Compras
- Proveedores
- Pedidos a proveedores
- Albaranes de proveedor
- Facturas de proveedor
- Recibos de proveedor
- Tickets y otros gastos
- Libro de facturas recibidas

### 2.9 Agenda
- Calendario
- Tareas

**Sub-panel del calendario** (izquierda media):
- Mini calendario navegable mes a mes
- Botón "Nuevo calendario +"
- **Mis calendarios** (checkboxes con icono):
  - Incidencias
  - Tareas automáticas
  - Actividad
  - Personal
- **Otros calendarios** (sección colapsable)

### 2.10 Informes
- De un vistazo
- Facturación
- Tesorería
- Ventas
- SAT
- Compras
- Valoración de stock
- De evolución
- Impuestos

---

## 3. Sub-sidebar — Footer común (todos los menús)

Items secundarios fijos al pie de la sub-sidebar:
- 📖 **Centro de ayuda**
- 🪶 **Vuelve a invitar a…** *(referidos)*
- 💬 **Chat**
- 🔔 **Novedades**
- Badge plan: **Business** + link "Mejorar"

Widget promocional rotativo (Multialmacén / GPS / Tempo / Productos compuestos / etc.):
- Aparece sobre el footer en una card naranja clara
- Icono + título + bajada + botón "Saber más" (naranja)
- Otra card abajo: "Trae a tus amigos y acumula descuentos" + botón azul "¡Lo quiero!"

---

## 4. Menú grilla (icono ⊞ a la derecha del top nav)

Dropdown amplio dividido en dos bloques:

### Tus funcionalidades
- API
- Inbox Compras
- Pagos online
- Tareas
- Connect
- Contabilidad
- Shop
- Bancos

### Funcionalidades adicionales
- Assistant
- Tempo
- Multialmacén
- Productos compuestos
- GPS
- Integraciones

Cada item: icono pastel (verde/violeta/azul/celeste) cuadrado de ~32px + label.
Layout: 3 columnas, cards verticales.

---

## 5. Dropdown de usuario (avatar + nombre + ▼)

Lista vertical (right-aligned, fondo blanco, sombra suave):
- Mi perfil
- Mi STEL Order
- Configuración
- Funcionalidades
- Club Amigo
- Acceso asesor
- Centro de ayuda
- Atajos de teclado
- Cerrar sesión

---

## 6. Patrones comunes de las listas (Catálogo, Clientes, Ventas, etc.)

**Barra de acciones superior (izquierda → derecha):**
- 🟧 Botón **"Nuevo +"** (naranja sólido)
- Botón **"Más ▾"** (acciones contextuales: importar, exportar, asignar, mover, etc.)
- *(En Ventas/Facturación)* Botón **"Ver / Imprimir"** con icono PDF
- *(En documentos con fecha)* Dropdown **"Últimos 6 meses ▾"** (filtro temporal: hoy, semana, mes, trimestre, año, personalizado)

**Barra superior derecha:**
- Input **"Buscar"** (busca por referencia/cliente)
- Botón **"Filtrar ▾"** (abre panel con filtros facetados según entidad)
- 🗑️ Icono **papelera** (ver descartados/papelera)
- ⚙️ Icono **rueda** (configurar columnas/preferencias de la tabla)

**Tabla principal:**
- Checkbox en cada fila + checkbox cabecera (selección masiva)
- Cabeceras con icono ⇅ sortable + input **"Buscar"** debajo de cada columna (filtro inline)
- Filas: fondo blanco, hover gris muy claro `#F8F8F8`
- Badges de estado:
  - 🟢 **Cerrado** / **Cobrada** (verde `#10B981`)
  - 🟡 **Pendiente** (amarillo `#FBBF24`)
  - 🟠 **Pendiente de recibir** (naranja claro)
- Texto truncado con `…` cuando excede ancho de columna
- Paginación inferior: "Mostrando X a Y de Z" + selector "25 por página" + "Primera ‹ 1 2 3 4 5 › Última"

**Filtros de columna inline:**
Cada cabecera tiene un "Buscar" debajo que filtra esa columna.

**Panel "Filtrar"** (al abrir):
Muestra una lista de filtros disponibles según la entidad. Ejemplos vistos en Catálogo:
- Familia de productos…
- Tarifa…
- Productos en promoción
- Descatalogados
- Bajo stock mínimo
- Impuestos incluidos
- Control de stock…
- Estado de adjuntos…
- Estado de Shop…
- Creado desde…

---

## 7. Columnas vistas por entidad (referencia para tablas equivalentes)

### Productos (Catálogo)
Imagen · Referencia · Nombre · Stock real · Stock virtual · Precio · Precio de compra · Familia de productos · *(más a la derecha)*

### Clientes
Referencia · Nombre jurídico · Nombre · NIF · Teléfono · Email · Agente · Actividad

### Proveedores (Compras)
Referencia · Nombre jurídico · Nombre · NIF · Teléfono · Email · Agente · Actividad

### Presupuestos (Ventas)
Referencia · Cliente · Nombre comer(cial) · Título · Estado · Fecha · Importe · Fecha de creación

### Facturas
Referencia · Cliente · Título · Estado · Fecha · Importe · Pendiente · *(más)*

### Incidencias (SAT)
Referencia · Cliente · Descripción · Estado · Asignado a · Creado por · Fecha · Actividad

### Proyectos
Imagen · Color · Referencia · Nombre · Cliente · Estado · Creado por · Fecha de creación · Fecha inicio · Fecha fin · Importe estimado · Porcentaje · Actividad

---

## 8. Paleta de colores observada

| Token | Hex | Uso |
|-------|-----|-----|
| Top nav | `#0F0F0F` | Fondo barra superior |
| Item activo | `#FF6600` | Fondo del item seleccionado en top nav + bordes activos sub-sidebar + botón "Nuevo" |
| Item activo (sub-sidebar) | texto `#FF6600` + bg `#FFF5EE` | Item seleccionado en sub-menú lateral |
| Body | `#F2F2F2` | Fondo general área de contenido |
| Sub-sidebar | `#FFFFFF` | Fondo blanco panel lateral izquierdo |
| Cards | `#FFFFFF` con `box-shadow: 0 1px 3px rgba(0,0,0,.08)` | Cards de resumen, modales |
| Borders | `#E5E5E5` | Bordes muy sutiles |
| Texto principal | `#1F2937` | Bold para títulos, regular para tabla |
| Texto secundario | `#6B7280` | Labels, captions |
| Botón Club Amigo | `#3B82F6` | Azul plano |
| Badge Cobrada/Cerrado | `#10B981` bg `#D1FAE5` | Verde pastel |
| Badge Pendiente | `#FBBF24` / `#92400E` sobre bg amarillo claro | Amarillo |
| Hover row | `#F8F8F8` | Hover tabla |

---

## 9. Comparación con Mocciaro Soft actual

| StelOrder | Mocciaro Soft equivalente | Estado |
|-----------|---------------------------|--------|
| Inicio | `/inicio` | ✅ Existe |
| Catálogo → Productos | `/catalogo` | ✅ Existe |
| Catálogo → Servicios | *(falta)* | ❌ Crear tab |
| Catálogo → Gastos e inversiones | `/gastos` | ✅ Existe (mover de Compras a Catálogo) |
| Catálogo → Activos en clientes | `/sat/activos` | ✅ Existe (mover) |
| Clientes → Clientes | `/clientes` | ✅ |
| Clientes → Clientes potenciales | *(en CRM como "leads"/"prospects")* | ⚠️ Renombrar |
| Clientes → Personas de contacto | `/clientes?tab=contactos` | ✅ |
| Ventas → Presupuestos | `/cotizador` | ✅ (renombrar a "Presupuestos") |
| Ventas → Pedidos | `/ventas?tab=pedidos` | ✅ |
| Ventas → Albaranes de venta | `/ventas?tab=albaranes` | ✅ |
| SAT → Incidencias | `/sat` | ✅ |
| SAT → Presupuestos | *(falta separado del de Ventas)* | ❌ Crear |
| SAT → Pedidos de trabajo | *(falta)* | ❌ Crear |
| SAT → Albaranes de trabajo | *(falta)* | ❌ Crear |
| Proyectos → Proyectos | `/workflows` *(parcial)* | ⚠️ Renombrar |
| Facturación → Facturas | `/ventas?tab=facturas` | ✅ |
| Facturación → Recibos de facturas | `/cobros` *(parcial)* | ⚠️ |
| Facturación → Facturas de abono | *(parcial en /ventas)* | ⚠️ |
| Facturación → Recibos de abono | *(falta)* | ❌ |
| Facturación → Libro de facturas emitidas | *(falta)* | ❌ Crear |
| Compras → Proveedores | `/compras?tab=proveedores` | ✅ |
| Compras → Pedidos a proveedores | `/compras?tab=pedidos` | ✅ |
| Compras → Albaranes de proveedor | `/compras?tab=recepciones` | ✅ |
| Compras → Facturas de proveedor | `/compras?tab=facturas` | ✅ |
| Compras → Recibos de proveedor | `/compras?tab=pagos` *(parcial)* | ⚠️ |
| Compras → Tickets y otros gastos | `/gastos` *(parcial)* | ⚠️ |
| Compras → Libro de facturas recibidas | *(falta)* | ❌ Crear |
| Agenda → Calendario | `/calendario` | ✅ |
| Agenda → Tareas | *(falta separado)* | ❌ Crear |
| Informes → De un vistazo | `/informes` | ✅ |
| Informes → Facturación/Ventas/SAT/Compras/Tesorería/etc. | *(parcial en /dashboard/ejecutivo)* | ⚠️ Separar |

---

## 10. Recomendaciones para alinear el shell

1. **Ajustar nav-tree** ([nav-tree.ts](../src/components/shell/nav-tree.ts)) para matchear 1:1 con StelOrder:
   - Mover `Pipeline CRM` del sub-menú de Clientes → sí queda, pero agregar también `Clientes potenciales`
   - Catálogo necesita 4 items: Productos / Servicios / Gastos e inversiones / Activos en clientes
   - SAT necesita: Incidencias / Presupuestos / Pedidos de trabajo / Albaranes de trabajo (separar de los de Ventas)
   - Facturación: 5 items (Facturas / Recibos facturas / Facturas abono / Recibos abono / Libro emitidas)
   - Compras: 7 items (Proveedores / Pedidos / Albaranes / Facturas / Recibos / Tickets gastos / Libro recibidas)
   - Agenda: Calendario / Tareas
   - Informes: 9 items

2. **Renombrar "Cotizador" → "Presupuestos"** en la UI (mantener ruta `/cotizador` por compat).

3. **Crear páginas faltantes** marcadas con ❌ arriba — son ~7 pantallas nuevas. Pueden empezar como redirects/placeholders.

4. **Dropdown de usuario** en TopNav: agregar items "Mi perfil", "Configuración", "Funcionalidades", "Acceso asesor", "Atajos de teclado", "Cerrar sesión" (hoy solo va al avatar a `/admin`).

5. **Menú grilla (Más)**: agrupar en "Tus funcionalidades" + "Funcionalidades adicionales" como StelOrder. Hoy es una grilla plana.

6. **Footer sub-sidebar**: ya tiene Centro de ayuda / Chat / Novedades / badge Business — falta agregar "Vuelve a invitar a…" si querés replicar al 100%.

7. **Filtros**:
   - Cada tabla debe permitir "Buscar" inline por columna (debajo de la cabecera).
   - Botón "Filtrar ▾" abre panel con filtros facetados (ya parcial).
   - Selector temporal "Últimos 6 meses ▾" en listados de documentos.

8. **Badges de estado**: alinear los colores actuales a los de StelOrder (verde para cerrado/cobrada, amarillo para pendiente).
