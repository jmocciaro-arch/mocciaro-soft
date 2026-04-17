/**
 * TANGO FACTURA CONNECT — Cliente TypeScript
 *
 * Docs: https://www.tangofactura.com/Help/DocApi?resName=Factura
 * Base URL: https://www.tangofactura.com
 *
 * Setup:
 *   1) Crear app en /PGR/Aplicaciones → obtener UserIdentifier + ApplicationPublicKey
 *   2) Crear perfil de facturación en /PGR/PerfilesFacturacion → obtener PerfilComprobanteID
 *   3) Guardar credenciales en tt_invoice_providers.config (por empresa)
 */

const TANGO_BASE = 'https://www.tangofactura.com'

export interface TangoCredentials {
  userIdentifier: string
  applicationPublicKey: string
}

export interface TangoAuthToken {
  token: string
  expiresAt?: number // epoch ms, estimación local (Tango no siempre lo declara)
}

export interface TangoError {
  Mensaje: string
  Nivel: number
}

export interface TangoResponse<T> {
  Data: T | null
  Error?: TangoError[]
  CodigoError?: number
}

// =====================================================
// MODELOS DE DOMINIO
// =====================================================

export type TangoLetra = 'A' | 'B' | 'C' | 'M'
export type TangoTipoDocumento = 1 | 2 | 3 | 4 | 5 | 6 | 7  // DNI|CUIT|CI|LE|LC|CUIL|CIext
export type TangoCategoriaImpositiva = 'EX' | 'MT' | 'CF' | 'RI' | 'CE'

export interface TangoDetalleAlicuota {
  AlicuotaCodigo: number
  AlicuotaPorcentaje: number
  ImpuestoID: number
}

export interface TangoDetalleMovimiento {
  ProductoCodigo?: string
  ProductoCodigoAlternativo?: string
  ProductoNombre?: string
  ProductoDescripcion?: string
  Cantidad: number
  Precio: number
  DepositoID?: number
  Bonificacion?: number
  DetalleAlicuotas?: TangoDetalleAlicuota[]
  PosicionImpuestoID?: number
}

export interface TangoCrearFacturaInput {
  Letra: TangoLetra
  ClienteCodigo?: string
  ClienteNombre: string
  ClienteDireccion?: string
  ClienteTipoDocumento?: TangoTipoDocumento
  ClienteNumeroDocumento?: string
  ClienteEmail?: string
  CategoriaImpositivaCodigo?: TangoCategoriaImpositiva | string
  Observacion?: string
  DetallesMovimiento: TangoDetalleMovimiento[]
  FechaComprobante?: string // ISO 8601
  FechaServicioDesde?: string
  FechaServicioHasta?: string
  MovimientoReferenciaID?: number
  TipoMovimiento?: number
  PerfilComprobanteID?: number | null
  DescuentoTotal?: number
  DepositoID?: number
}

export interface TangoMovimientoResult {
  MovimientoId: number
  Grabado: boolean
  Electronico: boolean
  EstadoId: number
  FechaEmision: string
  FechaVencimiento: string
  TotalIVA: number
  TotalOtrosImpuestos: number
  Total: number
  Subtotal: number
  CAE?: string
  CAEVencimiento?: string
  NumeroComprobante?: string
  PuntoVenta?: number
}

// =====================================================
// CLIENTE PRINCIPAL
// =====================================================

export class TangoClient {
  private creds: TangoCredentials
  private auth: TangoAuthToken | null = null

  constructor(creds: TangoCredentials) {
    this.creds = creds
  }

  // ── Auth ───────────────────────────────────────────
  async getToken(): Promise<string> {
    const now = Date.now()
    if (this.auth && this.auth.expiresAt && this.auth.expiresAt > now + 30_000) {
      return this.auth.token
    }

    const res = await fetch(`${TANGO_BASE}/Services/Provisioning/GetAuthToken`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        UserIdentifier: this.creds.userIdentifier,
        ApplicationPublicKey: this.creds.applicationPublicKey,
      }),
    })

    const json = (await res.json()) as TangoResponse<{ Token: string }>
    if (!res.ok || !json.Data?.Token) {
      throw new Error(
        `Tango GetAuthToken falló: ${json.Error?.map((e) => e.Mensaje).join('; ') || res.statusText}`
      )
    }

    this.auth = { token: json.Data.Token, expiresAt: now + 30 * 60_000 } // 30 min de margen
    return this.auth.token
  }

  private async authedPost<T>(path: string, body: Record<string, unknown>): Promise<T> {
    const token = await this.getToken()
    const payload = {
      ...body,
      UserIdentifier: this.creds.userIdentifier,
      ApplicationPublicKey: this.creds.applicationPublicKey,
      Token: token,
    }

    const res = await fetch(`${TANGO_BASE}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })

    const json = (await res.json()) as TangoResponse<T>
    if (!res.ok || (json.Error && json.Error.length > 0 && json.Error.some((e) => e.Nivel >= 2))) {
      throw new Error(`Tango ${path} falló: ${json.Error?.map((e) => e.Mensaje).join('; ')}`)
    }
    if (!json.Data) {
      throw new Error(`Tango ${path}: respuesta sin Data`)
    }
    return json.Data
  }

  // ── Facturación ─────────────────────────────────────
  crearFactura(input: TangoCrearFacturaInput) {
    return this.authedPost<TangoMovimientoResult>('/Services/Facturacion/CrearFactura', input as unknown as Record<string, unknown>)
  }

  crearFacturaA(input: Omit<TangoCrearFacturaInput, 'Letra'>) {
    return this.authedPost<TangoMovimientoResult>('/Services/Facturacion/CrearFacturaA', { ...input, Letra: 'A' } as unknown as Record<string, unknown>)
  }

  crearFacturaB(input: Omit<TangoCrearFacturaInput, 'Letra'>) {
    return this.authedPost<TangoMovimientoResult>('/Services/Facturacion/CrearFacturaB', { ...input, Letra: 'B' } as unknown as Record<string, unknown>)
  }

  crearFacturaC(input: Omit<TangoCrearFacturaInput, 'Letra'>) {
    return this.authedPost<TangoMovimientoResult>('/Services/Facturacion/CrearFacturaC', { ...input, Letra: 'C' } as unknown as Record<string, unknown>)
  }

  /**
   * Nota de Crédito vinculada a una factura existente (para devoluciones parciales/totales).
   * MovimientoReferenciaID = MovimientoId de la factura original.
   */
  crearNotaCredito(input: TangoCrearFacturaInput & { MovimientoReferenciaID: number }) {
    return this.authedPost<TangoMovimientoResult>(
      '/Services/Facturacion/CrearCredito',
      input as unknown as Record<string, unknown>
    )
  }

  /** Nota de Crédito sin factura asociada (p.ej. bonificación) */
  crearNotaCreditoACuenta(input: TangoCrearFacturaInput) {
    return this.authedPost<TangoMovimientoResult>(
      '/Services/Facturacion/CrearCreditoACuenta',
      input as unknown as Record<string, unknown>
    )
  }

  vistaPrevia(input: TangoCrearFacturaInput) {
    return this.authedPost<TangoMovimientoResult>('/Services/Facturacion/VistaPreviaMovimiento', input as unknown as Record<string, unknown>)
  }

  autorizarMovimiento(movimientoId: number) {
    return this.authedPost<TangoMovimientoResult>('/Services/Facturacion/AutorizarMovimiento', {
      MovimientoID: movimientoId,
    })
  }

  obtenerInfoMovimiento(movimientoId: number) {
    return this.authedPost<TangoMovimientoResult>('/Services/Facturacion/ObtenerInfoMovimiento', {
      MovimientoID: movimientoId,
    })
  }

  enviarComprobantePorMail(movimientoId: number, email?: string) {
    return this.authedPost<{ Enviado: boolean }>('/Services/Facturacion/EnviarComprobanteElectronico', {
      MovimientoID: movimientoId,
      Email: email,
    })
  }

  // PDF: es GET con query string
  async getPDF(preferencia: string): Promise<ArrayBuffer> {
    const token = await this.getToken()
    const url = `${TANGO_BASE}/Services/Facturacion/GetOrCreatePDF?preferencia=${encodeURIComponent(preferencia)}`
    const res = await fetch(url, {
      method: 'GET',
      headers: {
        'X-UserIdentifier': this.creds.userIdentifier,
        'X-ApplicationPublicKey': this.creds.applicationPublicKey,
        'X-Token': token,
      },
    })
    if (!res.ok) throw new Error(`Tango getPDF falló: ${res.statusText}`)
    return res.arrayBuffer()
  }

  // ── Clientes ────────────────────────────────────────
  crearCliente(cliente: Record<string, unknown>) {
    return this.authedPost<{ ClienteID: number; ClienteCodigo: string }>(
      '/Services/Facturacion/CrearCliente',
      cliente
    )
  }

  modificarCliente(cliente: Record<string, unknown>) {
    return this.authedPost<{ ClienteID: number }>('/Services/Facturacion/ModificarCliente', cliente)
  }

  listarClientes(filtro: Record<string, unknown> = {}) {
    return this.authedPost<Array<Record<string, unknown>>>('/Services/Facturacion/ListarClientes', filtro)
  }

  // ── Productos ───────────────────────────────────────
  crearProducto(producto: Record<string, unknown>) {
    return this.authedPost<{ ProductoID: number; ProductoCodigo: string }>(
      '/Services/Facturacion/CrearProducto',
      producto
    )
  }

  listarProductos(filtro: Record<string, unknown> = {}) {
    return this.authedPost<Array<Record<string, unknown>>>('/Services/Facturacion/ListarProductos', filtro)
  }

  // ── Datos maestros ──────────────────────────────────
  listarAlicuotas() {
    return this.authedPost<Array<{ Codigo: number; Nombre: string; Porcentaje: number }>>(
      '/Services/Facturacion/ListarAlicuotas',
      {}
    )
  }

  listarMonedas() {
    return this.authedPost<Array<{ Codigo: string; Nombre: string; Activa: boolean }>>(
      '/Services/Facturacion/ListarMonedas',
      {}
    )
  }

  listarPuntosVenta() {
    return this.authedPost<Array<{ NumeroPV: number; Nombre: string }>>(
      '/Services/Facturacion/ListarPuntosVenta',
      {}
    )
  }

  listarPerfilesFacturacion() {
    return this.authedPost<Array<{ PerfilComprobanteID: number; Nombre: string }>>(
      '/Services/Facturacion/ListarPerfilesFacturacion',
      {}
    )
  }

  listarTiposDocumento() {
    return this.authedPost<Array<{ Codigo: number; Descripcion: string }>>(
      '/Services/Facturacion/ListarTiposDocumento',
      {}
    )
  }

  listarCategoriasImpositivas() {
    return this.authedPost<Array<{ Codigo: string; Descripcion: string }>>(
      '/Services/Facturacion/ListarCategoriasImpositivas',
      {}
    )
  }

  obtenerConfiguracionEmpresa() {
    return this.authedPost<Record<string, unknown>>(
      '/Services/Facturacion/ObtenerConfiguracionEmpresa',
      {}
    )
  }

  // ── Consultas ───────────────────────────────────────
  listarMovimientos(filtro: Record<string, unknown> = {}) {
    return this.authedPost<Array<Record<string, unknown>>>('/Services/Facturacion/ListarMovimientos', filtro)
  }

  totalFacturacionMovimientos(filtro: Record<string, unknown> = {}) {
    return this.authedPost<{ Total: number }>(
      '/Services/Facturacion/TotalFacturacionMovimientos',
      filtro
    )
  }
}

// =====================================================
// FACTORY: obtener cliente Tango desde DB por empresa
// =====================================================

export function tangoClientFromConfig(config: { user_identifier: string; application_public_key: string }) {
  return new TangoClient({
    userIdentifier: config.user_identifier,
    applicationPublicKey: config.application_public_key,
  })
}
