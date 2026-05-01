// ============================================================================
// Mocciaro Soft ERP — API: Busqueda facetada de productos
// GET /api/products/search?q=&family=&brand=&encastre=&limit=&offset=
//
// Devuelve:
//   - items: productos que matchean (con media si esta disponible)
//   - facets: counts para cada filtro disponible
//   - total: total de productos que matchean (sin paginar)
//
// Pensado para alimentar la pagina publica /buscador dentro del cotizador,
// replicando la UX del buscador SPEEDRILL/APEX pero apuntando a tt_products.
// ============================================================================

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

type SearchFilters = {
  q: string | null;
  family: string | null;    // slug de tt_product_families
  brand: string | null;
  category: string | null;
  encastre: string | null;
  torqueMin: number | null;
  torqueMax: number | null;
  limit: number;
  offset: number;
};

function parseFilters(params: URLSearchParams): SearchFilters {
  const num = (v: string | null) => (v && !Number.isNaN(+v) ? +v : null);
  return {
    q: params.get('q')?.trim() || null,
    family: params.get('family')?.trim() || null,
    brand: params.get('brand')?.trim() || null,
    category: params.get('category')?.trim() || null,
    encastre: params.get('encastre')?.trim() || null,
    torqueMin: num(params.get('torqueMin')),
    torqueMax: num(params.get('torqueMax')),
    limit: Math.min(Math.max(+(params.get('limit') || 24), 1), 100),
    offset: Math.max(+(params.get('offset') || 0), 0),
  };
}

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { searchParams } = new URL(request.url);
    const f = parseFilters(searchParams);

    // ---- Query base ----
    let q = supabase
      .from('tt_products')
      .select(
        'id, sku, name, brand, category, subcategory, encastre, modelo, ' +
          'price_eur, price_usd, price_ars, torque_min, torque_max, rpm, ' +
          'image_url, diagram_url, gallery_urls, specs, family_id',
        { count: 'exact' }
      )
      .eq('active', true);

    if (f.q) {
      // full-text en search_text (ya existe en la tabla)
      const needle = f.q.replace(/[%_,]/g, ' ').trim();
      q = q.ilike('search_text', `%${needle}%`);
    }
    if (f.brand)    q = q.eq('brand', f.brand);
    if (f.category) q = q.eq('category', f.category);
    if (f.encastre) q = q.eq('encastre', f.encastre);

    if (f.torqueMin != null) q = q.gte('torque_max', f.torqueMin);
    if (f.torqueMax != null) q = q.lte('torque_min', f.torqueMax);

    // Family por slug: necesita join o un lookup previo
    let familyId: string | null = null;
    if (f.family) {
      const { data: fam } = await supabase
        .from('tt_product_families')
        .select('id')
        .eq('slug', f.family)
        .maybeSingle();
      familyId = fam?.id || null;
      if (familyId) q = q.eq('family_id', familyId);
    }

    q = q.order('name', { ascending: true }).range(f.offset, f.offset + f.limit - 1);

    const { data: items, error, count } = await q;
    if (error) {
      console.error('[api/products/search]', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // ---- Facets (counts por brand / category / encastre para el universo filtrado) ----
    // Traemos una ventana grande (sin paginar) solo de los campos facetables.
    let facetQuery = supabase
      .from('tt_products')
      .select('brand, category, encastre')
      .eq('active', true)
      .limit(5000);

    if (f.q) {
      const needle = f.q.replace(/[%_,]/g, ' ').trim();
      facetQuery = facetQuery.ilike('search_text', `%${needle}%`);
    }
    if (familyId) facetQuery = facetQuery.eq('family_id', familyId);

    const { data: facetRows } = await facetQuery;

    const tally = (key: 'brand' | 'category' | 'encastre') => {
      const counts: Record<string, number> = {};
      for (const r of facetRows || []) {
        const v = (r as Record<string, unknown>)[key];
        if (typeof v === 'string' && v.length) counts[v] = (counts[v] || 0) + 1;
      }
      return Object.entries(counts)
        .sort((a, b) => b[1] - a[1])
        .map(([value, count]) => ({ value, count }));
    };

    return NextResponse.json({
      total: count ?? items?.length ?? 0,
      items: items || [],
      facets: {
        brand: tally('brand'),
        category: tally('category'),
        encastre: tally('encastre'),
      },
      filters: f,
    });
  } catch (err) {
    console.error('[api/products/search] unexpected', err);
    return NextResponse.json(
      { error: 'Error interno del servidor' },
      { status: 500 }
    );
  }
}
