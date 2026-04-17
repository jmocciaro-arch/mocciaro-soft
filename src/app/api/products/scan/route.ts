// ============================================================================
// Mocciaro Soft ERP — API: Barcode Scanner
// GET /api/products/scan?barcode=XXX&companyId=YYY
// Busca un producto por código de barras o SKU
// ============================================================================

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const barcode = searchParams.get('barcode')?.trim();
  const companyId = searchParams.get('companyId')?.trim();

  if (!barcode) {
    return NextResponse.json(
      { error: 'El parámetro barcode es obligatorio' },
      { status: 400 }
    );
  }

  try {
    const supabase = await createClient();

    // Buscar por barcode o por sku (case-insensitive)
    let query = supabase
      .from('tt_products')
      .select(
        'id, name, sku, barcode, price, cost, stock_quantity, image_url, category, unit, description, brand, company_id'
      )
      .or(`barcode.eq.${barcode},sku.ilike.${barcode}`)
      .limit(5);

    // Filtrar por empresa si se provee
    if (companyId) {
      query = query.eq('company_id', companyId);
    }

    const { data, error } = await query;

    if (error) {
      console.error('[API/scan] Error buscando producto:', error);
      return NextResponse.json(
        { error: 'Error buscando el producto' },
        { status: 500 }
      );
    }

    if (!data || data.length === 0) {
      return NextResponse.json(
        { error: 'Producto no encontrado', barcode },
        { status: 404 }
      );
    }

    // Tomar el primero (o el que más coincida con el barcode exacto)
    const product =
      data.find((p) => p.barcode === barcode) ?? data[0];

    return NextResponse.json({
      id: product.id,
      name: product.name,
      sku: product.sku,
      barcode: product.barcode,
      price: product.price,
      cost: product.cost,
      stock: product.stock_quantity,
      imageUrl: product.image_url,
      category: product.category,
      unit: product.unit,
      description: product.description,
      brand: product.brand,
      companyId: product.company_id,
    });
  } catch (err) {
    console.error('[API/scan] Error inesperado:', err);
    return NextResponse.json(
      { error: 'Error interno del servidor' },
      { status: 500 }
    );
  }
}
