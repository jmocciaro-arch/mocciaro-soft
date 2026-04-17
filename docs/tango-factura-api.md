# Tango Factura Connect — API Reference

**Portal:** https://www.tangofactura.com/Home/BsDashboard → Aplicaciones → **Tango factura connect**
**Docs dev:** https://www.tangofactura.com/Help
**Base URL:** `https://www.tangofactura.com`

## 1. Setup — obtener credenciales

1. Iniciar sesión en Tango Factura (usuario actual: **MOCCIARO JUAN MANUEL JESUS**).
2. Ir a **Aplicaciones → Tango factura connect** (`/PGR/ConfiguracionApi`).
3. Secciones:
   - **Aplicaciones** (`/PGR/Aplicaciones`): crear una aplicación → devuelve `UserIdentifier` + `ApplicationPublicKey`.
   - **Perfiles de facturación** (`/PGR/PerfilesFacturacion`): definir perfiles (puntos de venta, impuestos por defecto, etc). Devuelve `PerfilComprobanteID`.
   - **Documentación** (`/Help/DocApi?resName=Factura`): referencia REST completa.
4. Crear una nueva app con: Nombre, Descripción, URL logo, Datos de contacto.

## 2. Autenticación

Todos los request llevan estos campos (o header) y un `Token` de sesión que se obtiene con:

**POST** `/Services/Provisioning/GetAuthToken`

Body:
```json
{
  "UserIdentifier": "<user-id-de-la-app>",
  "ApplicationPublicKey": "<public-key-de-la-app>"
}
```

Respuesta: `{ "Data": { "Token": "..." } }` → usar `Token` en todos los request siguientes.

## 3. Endpoints principales

### 🧾 Facturación (core para integración)
| Endpoint | Verbo | Descripción |
|---|---|---|
| `/Services/Facturacion/CrearFactura` | POST | Factura genérica (elige letra automática según config) |
| `/Services/Facturacion/CrearFacturaA` | POST | Factura letra A / M |
| `/Services/Facturacion/CrearFacturaB` | POST | Factura letra B |
| `/Services/Facturacion/CrearFacturaC` | POST | Factura letra C |
| `/Services/Facturacion/CrearCredito` | POST | Nota crédito vinculada a factura |
| `/Services/Facturacion/CrearCreditoACuenta` | POST | Nota crédito sin factura asociada |
| `/Services/Facturacion/VistaPreviaMovimiento` | POST | Preview antes de emitir |
| `/Services/Facturacion/AutorizarMovimiento` | POST | Enviar a AFIP para obtener CAE |
| `/Services/Facturacion/CrearLoteMovimientos` | POST | Batch de comprobantes |
| `/Services/Facturacion/AutorizarLoteMovimientos` | POST | Batch autorizar |
| `/Services/Facturacion/GetOrCreatePDF?preferencia={preferencia}` | GET | Descargar/obtener PDF oficial |
| `/Services/Facturacion/EnviarComprobanteElectronico` | POST | Enviar por mail al cliente |

### 📋 Consultas
| Endpoint | Descripción |
|---|---|
| `ListarMovimientos` | Lista comprobantes con filtros |
| `ObtenerInfoMovimiento` | Info completa de 1 comprobante (por ID) |
| `ObtenerInfoMovimientosPorNroFactura` | Busca por número |
| `ListarMovimientosQueVencenHoy` | Vencimientos del día |
| `TotalFacturacionMovimientos` | Totales agregados |

### 👥 Clientes
| Endpoint | Descripción |
|---|---|
| `CrearCliente` / `CrearLoteClientes` / `ModificarCliente` | ABM |
| `ListarClientes` | Lista con filtros |
| `ObtenerSaldosCliente` | Saldo por ClienteCodigo |

### 📦 Productos / Stock / Precios
| Endpoint | Descripción |
|---|---|
| `CrearProducto` / `ModificarProducto` / `ListarProductos` / `CrearLoteProductos` | ABM |
| `GetStockPorConcepto` / `GetStockPorDeposito` / `GetStockPorDepositoConcepto` | Stock |
| `GetPreciosPorConcepto` / `GetPreciosPorLista` / `GetPrecioPorListaConcepto` | Precios |

### 🧮 Datos maestros (one-shot al setup)
| Endpoint | Para cachear |
|---|---|
| `ListarAlicuotas` | IVA por código |
| `ListarMonedas` | Monedas activas |
| `ListarImpuestos` / `ListarImpuestosIIBB` | Impuestos |
| `ListarTiposDocumento` | DNI/CUIT/CI/LE/LC/CUIL |
| `ListarCategoriasImpositivas` | RI/MT/CF/EX/CE |
| `ListarProvincias` | Provincias AR |
| `ListarEstados` | Estados posibles de comprobantes |
| `ListarPuntosVenta` / `CrearPuntoVenta` | Puntos venta |
| `ListarPerfilesFacturacion` | Perfiles (campo `PerfilComprobanteID`) |
| `ObtenerConfiguracionEmpresa` / `ObtenerCategoriaImpositivaEmpresa` | Config empresa |
| `ObtenerDatosContribuyente` | Datos AFIP |

### 📃 Documentos comerciales (compras/ventas/pagos)
| Endpoint | Descripción |
|---|---|
| `ListarPresupuestos` / `ObtenerInfoPresupuesto` | Presupuestos |
| `ListarRemitosVentas` / `ListarRemitosCompras` / `ObtenerInfoRemito` | Remitos |
| `ListarPagosEmitidos` / `ObtenerInfoPago` | Pagos |

### 🔌 E-commerce vinculado
| Endpoint | Descripción |
|---|---|
| `ObtenerTiendasVinculadas` | Shopify / Tiendanube / WooCommerce / MercadoLibre |
| `ObtenerPedidos` | Pedidos de una tienda |

## 4. Schema clave — `CrearFactura`

### Request body (`FacturacionModel`)
```json
{
  "Letra": "A",               // A | B | C | M
  "ClienteCodigo": "00001458",
  "ClienteNombre": "Acme SA",
  "ClienteDireccion": "...",
  "ClienteTipoDocumento": 2,  // 1:DNI 2:CUIT 3:CI 4:LE 5:LC 6:CUIL 7:CI ext
  "ClienteNumeroDocumento": "30-63165881-0",
  "ClienteEmail": "facturacion@acme.com",
  "CategoriaImpositivaCodigo": "RI",  // EX MT CF RI CE
  "Observacion": "Observación opcional",
  "DetallesMovimiento": [
    {
      "ProductoCodigo": "ML48516",
      "ProductoNombre": "Producto inicial",
      "ProductoDescripcion": "...",
      "Cantidad": 2.0,
      "Precio": 3.0,
      "DepositoID": 1,
      "Bonificacion": 4.0,
      "DetalleAlicuotas": [
        { "AlicuotaCodigo": 1, "AlicuotaPorcentaje": 21.0, "ImpuestoID": 2 }
      ],
      "PosicionImpuestoID": 1
    }
  ],
  "FechaComprobante": "2026-04-15T00:00:00-03:00",
  "TipoMovimiento": 1,        // FVA | CVA
  "PerfilComprobanteID": 1,   // null = perfil automático
  "DepositoID": 1,
  "DescuentoTotal": 0,
  "UserIdentifier": "",
  "ApplicationPublicKey": "",
  "Token": ""
}
```

### Response
```json
{
  "Data": {
    "MovimientoId": 0,
    "Grabado": false,
    "Electronico": false,
    "EstadoId": 0,
    "FechaEmision": "...",
    "FechaVencimiento": "...",
    "TotalIVA": 0.0,
    "TotalOtrosImpuestos": 0.0,
    "Total": 0.0,
    "Subtotal": 0.0
  },
  "Error": [
    { "Mensaje": "Error 404", "Nivel": 1 }
  ],
  "CodigoError": 2
}
```

## 5. Flujo típico de emisión

```
1. GetAuthToken(UserIdentifier, ApplicationPublicKey) → Token
2. (opcional) VistaPreviaMovimiento → chequear antes de emitir
3. CrearFactura(...) → MovimientoId (sin CAE aún)
4. AutorizarMovimiento(MovimientoId) → CAE + FechaVencimiento
5. GetOrCreatePDF(MovimientoId) → PDF oficial
6. (opcional) EnviarComprobanteElectronico → mail al cliente
```

## 6. SDKs oficiales
- **SDK C#** — descarga desde `/Help`
- **SDK PHP** — descarga desde `/Help`
- **TypeScript** — lo implementamos en `src/lib/invoicing/tango-client.ts`

## 7. Plan de integración con Mocciaro Soft

### Empresas target (solo Argentina):
- **BuscaTools SA** (AR)
- **Torquear SA** (AR)

### Variables de entorno necesarias (por empresa):
```
TANGO_USER_IDENTIFIER_BUSCATOOLS=...
TANGO_APP_PUBLIC_KEY_BUSCATOOLS=...
TANGO_USER_IDENTIFIER_TORQUEAR=...
TANGO_APP_PUBLIC_KEY_TORQUEAR=...
```
O preferible: guardar en `tt_invoice_providers.config` (encriptado) por empresa.

### Sincronizaciones recomendadas:
1. **Datos maestros** (al setup y con cron diario):
   - `ListarAlicuotas`, `ListarMonedas`, `ListarProvincias`, `ListarTiposDocumento`,
     `ListarCategoriasImpositivas`, `ListarPuntosVenta`, `ListarPerfilesFacturacion`
2. **Clientes** (antes de facturar): sync 1-a-1 por CUIT, cachear `ClienteCodigo` en `tt_clients.tango_cliente_codigo`.
3. **Productos** (al alta de producto en ERP): `CrearProducto` → cachear `ProductoCodigo`.

### Mapeo de campos Mocciaro → Tango:
| Mocciaro | Tango |
|---|---|
| `tt_clients.cuit` | `ClienteNumeroDocumento` |
| `tt_clients.name` | `ClienteNombre` |
| `tt_clients.address` | `ClienteDireccion` |
| `tt_clients.email` | `ClienteEmail` |
| `tt_clients.tax_category` (RI/MT/CF) | `CategoriaImpositivaCodigo` |
| `tt_document_items.sku` | `ProductoCodigo` |
| `tt_document_items.quantity` | `Cantidad` |
| `tt_document_items.unit_price` | `Precio` |
| `tt_document_items.discount_pct` | `Bonificacion` |

### Estados del flujo (en `tt_documents.status`):
```
draft → ready_to_invoice → emitted_no_cae → authorized → sent_to_client
```
