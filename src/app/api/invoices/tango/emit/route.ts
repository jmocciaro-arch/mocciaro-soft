import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { TangoClient, type TangoCrearFacturaInput, type TangoLetra } from '@/lib/invoicing/tango-client'

export const runtime = 'nodejs'
export const maxDuration = 60

/**
 * POST /api/invoices/tango/emit
 *
 * Body:
 * {
 *   companyId: string,
 *   sourceDocId?: string,        // pedido/albarán origen
 *   clientId?: string,           // tt_clients.id (para rescatar datos fiscales)
 *   letra?: 'A'|'B'|'C'|'M',
 *   items: [{ sku, description, quantity, unit_price, discount_pct?, iva_pct? }],
 *   observacion?: string,
 *   autorizar?: boolean          // true = autoriza en AFIP inmediatamente
 * }
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const {
      companyId,
      sourceDocId,
      clientId,
      letra = 'A',
      items,
      observacion,
      autorizar = true,
      docType = 'factura',              // 'factura' | 'nota_credito' | 'nota_debito'
      movimientoReferenciaId,           // requerido si es NC vinculada o ND
    } = body

    if (!companyId || !items?.length) {
      return NextResponse.json({ error: 'companyId e items son requeridos' }, { status: 400 })
    }

    // Usamos service role para saltar RLS en server
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { persistSession: false } }
    )

    // 1) Obtener credenciales Tango de la empresa
    const { data: provider, error: provErr } = await supabase
      .from('tt_invoice_providers')
      .select('id, config')
      .eq('company_id', companyId)
      .eq('provider_type', 'tango_api')
      .eq('is_active', true)
      .maybeSingle()

    if (provErr || !provider) {
      return NextResponse.json(
        { error: 'Empresa sin provider Tango activo configurado' },
        { status: 400 }
      )
    }

    const config = (provider.config || {}) as {
      user_identifier?: string
      application_public_key?: string
      perfil_comprobante_id?: number
      punto_venta_default?: number
    }

    if (!config.user_identifier || !config.application_public_key) {
      return NextResponse.json(
        { error: 'Provider Tango sin credenciales (user_identifier / application_public_key)' },
        { status: 400 }
      )
    }

    const tango = new TangoClient({
      userIdentifier: config.user_identifier,
      applicationPublicKey: config.application_public_key,
    })

    // 2) Cargar cliente si viene clientId
    let clienteData: {
      ClienteCodigo?: string
      ClienteNombre: string
      ClienteDireccion?: string
      ClienteTipoDocumento?: 1 | 2
      ClienteNumeroDocumento?: string
      ClienteEmail?: string
      CategoriaImpositivaCodigo?: string
    } = { ClienteNombre: 'Consumidor Final' }

    if (clientId) {
      const { data: c } = await supabase
        .from('tt_clients')
        .select('name, address, email, cuit, tax_category, tango_cliente_codigo')
        .eq('id', clientId)
        .maybeSingle()
      if (c) {
        clienteData = {
          ClienteCodigo: c.tango_cliente_codigo || undefined,
          ClienteNombre: c.name,
          ClienteDireccion: c.address || undefined,
          ClienteTipoDocumento: c.cuit ? 2 : 1,
          ClienteNumeroDocumento: c.cuit || undefined,
          ClienteEmail: c.email || undefined,
          CategoriaImpositivaCodigo: c.tax_category || 'CF',
        }
      }
    }

    // 3) Armar input CrearFactura
    const input: TangoCrearFacturaInput = {
      Letra: letra as TangoLetra,
      ...clienteData,
      Observacion: observacion,
      DetallesMovimiento: items.map((it: any) => ({
        ProductoCodigo: it.sku || it.tango_producto_codigo,
        ProductoNombre: it.description,
        Cantidad: Number(it.quantity),
        Precio: Number(it.unit_price),
        Bonificacion: Number(it.discount_pct || 0),
        DetalleAlicuotas: [
          {
            AlicuotaCodigo: 1,
            AlicuotaPorcentaje: Number(it.iva_pct ?? 21),
            ImpuestoID: 2,
          },
        ],
      })),
      FechaComprobante: new Date().toISOString(),
      PerfilComprobanteID: config.perfil_comprobante_id ?? null,
    }

    // 4) Crear documento en Tango según tipo
    if (docType === 'nota_credito' || docType === 'nota_debito') {
      // TipoMovimiento en Tango: factura = 1, NC = 2, ND = 3 (convención típica)
      input.TipoMovimiento = docType === 'nota_credito' ? 2 : 3
      if (movimientoReferenciaId) input.MovimientoReferenciaID = movimientoReferenciaId
    }

    const movimiento = docType === 'nota_credito'
      ? (movimientoReferenciaId
          ? await tango.crearNotaCredito({ ...input, MovimientoReferenciaID: movimientoReferenciaId })
          : await tango.crearNotaCreditoACuenta(input))
      : await tango.crearFactura(input)

    // 5) Si se pidió autorizar, emitir a AFIP para obtener CAE
    let final = movimiento
    if (autorizar && movimiento.MovimientoId) {
      try {
        final = await tango.autorizarMovimiento(movimiento.MovimientoId)
      } catch (err) {
        console.warn('Autorizar falló, movimiento creado sin CAE:', err)
      }
    }

    // 6) Descargar PDF oficial y subirlo a Storage
    let pdfUrl: string | null = null
    try {
      const preferencia = String(final.MovimientoId || movimiento.MovimientoId)
      const pdfBuffer = await tango.getPDF(preferencia)
      const ts = Date.now()
      const path = `${companyId}/tango_${ts}_${preferencia}.pdf`
      const { error: upErr } = await supabase.storage
        .from('invoices')
        .upload(path, Buffer.from(pdfBuffer), { contentType: 'application/pdf' })
      if (!upErr) {
        const { data: pub } = supabase.storage.from('invoices').getPublicUrl(path)
        pdfUrl = pub.publicUrl
      }
    } catch (err) {
      console.warn('No se pudo descargar PDF de Tango:', err)
    }

    // 7) Guardar en tt_documents
    // Dejamos que el trigger SQL genere el system_code con prefijo de empresa
    const systemCode = ''
    const legalNumber = final.NumeroComprobante
      ? `${final.PuntoVenta?.toString().padStart(4, '0')}-${final.NumeroComprobante}`
      : undefined

    const { data: doc, error: docErr } = await supabase
      .from('tt_documents')
      .insert({
        type: docType,
        system_code: systemCode,
        legal_number: legalNumber,
        company_id: companyId,
        client_id: clientId,
        invoice_method: 'tango_api',
        provider_id: provider.id,
        tango_invoice_id: String(final.MovimientoId),
        tango_movimiento_id: final.MovimientoId,
        tango_autorizado_at: final.CAE ? new Date().toISOString() : null,
        cae: final.CAE,
        cae_expires: final.CAEVencimiento || final.FechaVencimiento,
        original_pdf_url: pdfUrl,
        preview_pdf_url: pdfUrl,
        invoice_number: legalNumber,
        invoice_date: final.FechaEmision,
        invoice_total: final.Total,
        invoice_currency: 'ARS',
        currency: 'ARS',
        subtotal: final.Subtotal,
        tax_amount: final.TotalIVA,
        total: final.Total,
        status: final.CAE ? 'autorizada' : 'emitida',
        extracted_data: { tango_movimiento: final },
      })
      .select('id')
      .single()

    if (docErr) throw docErr

    // 8) Link al documento origen
    if (sourceDocId) {
      await supabase.from('tt_document_links').insert({
        parent_id: sourceDocId,
        child_id: doc.id,
        relation_type: 'factura',
      })
    }

    return NextResponse.json({
      ok: true,
      documentId: doc.id,
      movimientoId: final.MovimientoId,
      cae: final.CAE,
      total: final.Total,
      pdfUrl,
    })
  } catch (err) {
    console.error('POST /api/invoices/tango/emit error:', err)
    return NextResponse.json({ error: (err as Error).message }, { status: 500 })
  }
}
