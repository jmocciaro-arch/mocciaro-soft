import { createClient } from '@/lib/supabase/client'

// =====================================================
// Intercompany Operations Logic
// =====================================================
// When BuscaTools needs FEIN products, it places an
// INTERCOMPANY order to TorqueTools SL.
// This generates: a SALE in TorqueTools + a PURCHASE in BuscaTools
// =====================================================

export interface IntercompanyItem {
  product_id: string | null
  sku: string | null
  description: string
  quantity: number
  unit_price: number
}

export interface IntercompanyPurchaseResult {
  purchaseOrderId: string
  purchaseOrderNumber: string
  salesOrderId: string
  salesOrderNumber: string
}

/**
 * Generate a document number for intercompany operations
 */
function generateIntercompanyNumber(prefix: string, type: 'PO' | 'SO'): string {
  const date = new Date()
  const y = date.getFullYear().toString().slice(-2)
  const m = (date.getMonth() + 1).toString().padStart(2, '0')
  const rand = Math.floor(Math.random() * 9999).toString().padStart(4, '0')
  return `IC-${prefix}-${type}-${y}${m}-${rand}`
}

/**
 * Creates an intercompany purchase order.
 *
 * When BuscaTools creates a purchase order to TorqueTools:
 * 1. Creates PO in BuscaTools (buyer)
 * 2. Auto-creates Sales Order in TorqueTools (seller)
 * 3. Links both documents
 * 4. Logs activity for both companies
 */
export async function createIntercompanyPurchase(
  buyerCompanyId: string,
  sellerCompanyId: string,
  items: IntercompanyItem[],
  notes?: string
): Promise<IntercompanyPurchaseResult> {
  const supabase = createClient()

  // 1. Get company details for both parties
  const { data: companies } = await supabase
    .from('tt_companies')
    .select('id, name, currency, country')
    .in('id', [buyerCompanyId, sellerCompanyId])

  if (!companies || companies.length < 2) {
    throw new Error('No se encontraron las empresas del grupo')
  }

  const buyer = companies.find(c => c.id === buyerCompanyId)!
  const seller = companies.find(c => c.id === sellerCompanyId)!

  // 2. Get intercompany relation for defaults
  const { data: relation } = await supabase
    .from('tt_intercompany_relations')
    .select('*')
    .eq('buyer_company_id', buyerCompanyId)
    .eq('seller_company_id', sellerCompanyId)
    .single()

  const currency = relation?.default_currency || seller.currency
  const incoterm = relation?.default_incoterm || 'EXW'

  // Calculate totals
  const subtotal = items.reduce((sum, item) => sum + (item.quantity * item.unit_price), 0)
  const taxRate = 0 // Intercompany typically 0% VAT for international
  const taxAmount = subtotal * (taxRate / 100)
  const total = subtotal + taxAmount

  // 3. Create Purchase Order in buyer company
  const poNumber = generateIntercompanyNumber(buyer.name.replace(/\s+/g, '').substring(0, 4).toUpperCase(), 'PO')

  const { data: po, error: poError } = await supabase
    .from('tt_purchase_orders')
    .insert({
      po_number: poNumber,
      company_id: buyerCompanyId,
      supplier_name: seller.name,
      supplier_email: null,
      status: 'sent',
      currency,
      subtotal,
      tax_amount: taxAmount,
      total,
      notes: `[INTERCOMPANY] ${notes || ''}\nIncoterm: ${incoterm}\nEmpresa vendedora: ${seller.name}`.trim(),
      expected_delivery: null,
    })
    .select('id, po_number')
    .single()

  if (poError || !po) {
    throw new Error(`Error al crear OC intercompany: ${poError?.message || 'unknown'}`)
  }

  // 4. Create PO items
  const poItems = items.map((item, idx) => ({
    po_id: po.id,
    product_id: item.product_id,
    sku: item.sku,
    description: item.description,
    quantity: item.quantity,
    received_quantity: 0,
    unit_price: item.unit_price,
    subtotal: item.quantity * item.unit_price,
    sort_order: idx,
  }))

  await supabase.from('tt_purchase_order_items').insert(poItems)

  // 5. Create Sales Order in seller company (mirror)
  const soNumber = generateIntercompanyNumber(seller.name.replace(/\s+/g, '').substring(0, 4).toUpperCase(), 'SO')

  // Find or create a client record for the buyer in the seller's client list
  let buyerClientId: string | null = null
  const { data: existingClient } = await supabase
    .from('tt_clients')
    .select('id')
    .eq('company_id', sellerCompanyId)
    .eq('name', buyer.name)
    .limit(1)
    .single()

  if (existingClient) {
    buyerClientId = existingClient.id
  } else {
    // Create buyer as client in seller's company
    const { data: newClient } = await supabase
      .from('tt_clients')
      .insert({
        name: buyer.name,
        legal_name: buyer.name,
        country: buyer.country,
        company_id: sellerCompanyId,
        category: 'intercompany',
        notes: `[INTERCOMPANY] Cliente interno del grupo`,
      })
      .select('id')
      .single()

    buyerClientId = newClient?.id || null
  }

  const { data: so, error: soError } = await supabase
    .from('tt_sales_orders')
    .insert({
      so_number: soNumber,
      company_id: sellerCompanyId,
      client_id: buyerClientId,
      status: 'open',
      currency,
      subtotal,
      tax_amount: taxAmount,
      total,
      notes: `[INTERCOMPANY] ${notes || ''}\nIncoterm: ${incoterm}\nEmpresa compradora: ${buyer.name}\nOC vinculada: ${poNumber}`.trim(),
    })
    .select('id, so_number')
    .single()

  if (soError || !so) {
    throw new Error(`Error al crear pedido de venta intercompany: ${soError?.message || 'unknown'}`)
  }

  // 6. Create SO items
  const soItems = items.map((item, idx) => ({
    sales_order_id: so.id,
    product_id: item.product_id,
    sku: item.sku,
    description: item.description,
    quantity: item.quantity,
    delivered_quantity: 0,
    unit_price: item.unit_price,
    discount_pct: 0,
    subtotal: item.quantity * item.unit_price,
    sort_order: idx,
  }))

  await supabase.from('tt_sales_order_items').insert(soItems)

  // 7. Link both documents
  await supabase.from('tt_document_relations').insert({
    source_type: 'purchase_order',
    source_id: po.id,
    target_type: 'sales_order',
    target_id: so.id,
    relation_type: 'intercompany',
    metadata: {
      buyer_company: buyer.name,
      seller_company: seller.name,
      currency,
      incoterm,
    },
  })

  // 8. Log activity for both companies
  const activities = [
    {
      entity_type: 'purchase_order',
      entity_id: po.id,
      action: 'intercompany_purchase_created',
      detail: `OC intercompany ${poNumber} creada hacia ${seller.name}`,
      metadata: { so_number: soNumber, seller_company: seller.name, total, currency },
    },
    {
      entity_type: 'sales_order',
      entity_id: so.id,
      action: 'intercompany_sale_created',
      detail: `Pedido de venta intercompany ${soNumber} creado desde ${buyer.name}`,
      metadata: { po_number: poNumber, buyer_company: buyer.name, total, currency },
    },
  ]

  await supabase.from('tt_activity_log').insert(activities)

  return {
    purchaseOrderId: po.id,
    purchaseOrderNumber: poNumber,
    salesOrderId: so.id,
    salesOrderNumber: soNumber,
  }
}

/**
 * Fetch intercompany relations for a company (as buyer)
 */
export async function getIntercompanyRelations(companyId: string) {
  const supabase = createClient()

  const { data, error } = await supabase
    .from('tt_intercompany_relations')
    .select(`
      *,
      buyer_company:tt_companies!buyer_company_id(id, name, country, currency),
      seller_company:tt_companies!seller_company_id(id, name, country, currency)
    `)
    .or(`buyer_company_id.eq.${companyId},seller_company_id.eq.${companyId}`)
    .eq('active', true)

  if (error) throw error
  return data || []
}

/**
 * Fetch intercompany documents (POs and SOs with intercompany links)
 */
export async function getIntercompanyDocuments(companyId: string) {
  const supabase = createClient()

  // Get document links involving this company
  const { data: links } = await supabase
    .from('tt_document_relations')
    .select('*')
    .eq('relation_type', 'intercompany')

  if (!links || links.length === 0) return []

  // Get POs for this company that are intercompany
  const poIds = links
    .filter(l => l.source_type === 'purchase_order')
    .map(l => l.source_id)

  const soIds = links
    .filter(l => l.target_type === 'sales_order')
    .map(l => l.target_id)

  const { data: pos } = await supabase
    .from('tt_purchase_orders')
    .select('*')
    .eq('company_id', companyId)
    .in('id', poIds.length > 0 ? poIds : ['__none__'])

  const { data: sos } = await supabase
    .from('tt_sales_orders')
    .select('*')
    .eq('company_id', companyId)
    .in('id', soIds.length > 0 ? soIds : ['__none__'])

  return {
    purchaseOrders: pos || [],
    salesOrders: sos || [],
    links: links || [],
  }
}

/**
 * Get companies that can sell to the given buyer company
 */
export async function getAvailableSellers(buyerCompanyId: string) {
  const supabase = createClient()

  const { data } = await supabase
    .from('tt_intercompany_relations')
    .select(`
      *,
      seller_company:tt_companies!seller_company_id(id, name, country, currency, company_type)
    `)
    .eq('buyer_company_id', buyerCompanyId)
    .eq('active', true)

  return (data || []).map(r => ({
    relation: r,
    company: r.seller_company,
  }))
}

/**
 * Get companies that buy from the given seller company
 */
export async function getAvailableBuyers(sellerCompanyId: string) {
  const supabase = createClient()

  const { data } = await supabase
    .from('tt_intercompany_relations')
    .select(`
      *,
      buyer_company:tt_companies!buyer_company_id(id, name, country, currency, company_type)
    `)
    .eq('seller_company_id', sellerCompanyId)
    .eq('active', true)

  return (data || []).map(r => ({
    relation: r,
    company: r.buyer_company,
  }))
}
