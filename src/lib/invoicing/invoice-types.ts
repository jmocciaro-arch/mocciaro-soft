/**
 * Tipos para el sistema de facturación multi-proveedor
 */

export type InvoiceMethod = 'tango_api' | 'manual_upload' | 'external'

export type InvoiceProviderType = InvoiceMethod

export interface InvoiceProvider {
  id: string
  company_id: string
  provider_type: InvoiceProviderType
  name: string
  is_default: boolean
  is_active: boolean
  config: Record<string, unknown>
}

/**
 * Datos extraídos por IA de un PDF de factura argentina
 */
export interface ExtractedInvoiceData {
  // Cabecera
  tipo?: string              // "Factura A", "Factura B", "Nota Crédito A"
  punto_venta?: string       // "00001"
  numero?: string            // "00001234"
  numero_completo?: string   // "0001-00001234"
  fecha?: string             // ISO YYYY-MM-DD
  cae?: string
  cae_vto?: string           // ISO YYYY-MM-DD

  // Emisor
  emisor_razon_social?: string
  emisor_cuit?: string
  emisor_domicilio?: string
  emisor_iibb?: string

  // Receptor
  cliente_razon_social?: string
  cliente_cuit?: string
  cliente_domicilio?: string
  cliente_condicion_iva?: string

  // Items
  items?: Array<{
    descripcion?: string
    cantidad?: number
    precio_unitario?: number
    subtotal?: number
    iva_pct?: number
  }>

  // Totales
  subtotal?: number
  iva_105?: number
  iva_21?: number
  iva_27?: number
  otros_impuestos?: number
  total?: number
  moneda?: string            // ARS | USD | EUR

  // Condiciones
  condicion_venta?: string
  forma_pago?: string

  // Meta
  confidence?: number        // 0-1 score de confianza del parseo
  provider_used?: 'gemini' | 'claude'
  raw_text?: string
}

export interface InvoiceAttachment {
  id: string
  type: 'pedido' | 'albaran' | 'factura' | 'nota_credito'
  invoice_method?: InvoiceMethod
  provider_id?: string | null
  original_pdf_url?: string | null
  preview_pdf_url?: string | null
  invoice_number?: string | null
  invoice_date?: string | null
  invoice_total?: number | null
  invoice_currency?: string | null
  cae?: string | null
  cae_expires?: string | null
  tango_invoice_id?: string | null
  extracted_data?: ExtractedInvoiceData
  afip_response?: Record<string, unknown> | null
}
