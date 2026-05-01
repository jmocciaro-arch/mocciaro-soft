/* eslint-disable @next/next/no-img-element */
// ============================================================================
// Buscador publico de productos — estilo SPEEDRILL / APEX
// Ruta: /buscador  (accesible sin login, usa tt_products via /api/products/search)
// ----------------------------------------------------------------------------
// Caracteristicas:
//   - Facetas dinamicas (brand / category / encastre) con counts
//   - Busqueda por texto con debounce
//   - Modal de producto con foto principal + diagrama tecnico lado a lado
//   - Galeria multi-imagen desde gallery_urls
//   - Diseño single-file autocontenido (estilo spike.html)
// ============================================================================
'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

type Product = {
  id: string;
  sku: string;
  name: string;
  brand: string | null;
  category: string | null;
  subcategory: string | null;
  encastre: string | null;
  modelo: string | null;
  price_eur: number | null;
  price_usd: number | null;
  price_ars: number | null;
  torque_min: number | null;
  torque_max: number | null;
  rpm: string | null;
  image_url: string | null;
  diagram_url: string | null;
  gallery_urls: Array<{ url: string; alt?: string; sort_order?: number }>;
  specs: Record<string, unknown> | null;
  family_id: string | null;
};

type FacetItem = { value: string; count: number };
type Facets = { brand: FacetItem[]; category: FacetItem[]; encastre: FacetItem[] };
type ApiResponse = { total: number; items: Product[]; facets: Facets };

const fmtPrice = (v: number | null, currency: 'EUR' | 'USD' | 'ARS') => {
  if (!v) return '—';
  const sym = { EUR: '€', USD: 'US$', ARS: '$' }[currency];
  return `${sym} ${v.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};

const PLACEHOLDER_SVG =
  'data:image/svg+xml;utf8,' +
  encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120"><rect width="120" height="120" fill="#f3f4f6"/><path d="M30 45h60v40H30z" fill="none" stroke="#9ca3af" stroke-width="2"/><circle cx="48" cy="60" r="7" fill="#9ca3af"/><path d="M30 80l18-18 12 12 16-20 14 26" fill="none" stroke="#9ca3af" stroke-width="2"/></svg>`
  );

export default function BuscadorPage() {
  const [q, setQ] = useState('');
  const [brand, setBrand] = useState<string | null>(null);
  const [category, setCategory] = useState<string | null>(null);
  const [encastre, setEncastre] = useState<string | null>(null);
  const [data, setData] = useState<ApiResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<Product | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const fetchData = useCallback(async () => {
    abortRef.current?.abort();
    const ctl = new AbortController();
    abortRef.current = ctl;
    setLoading(true);
    try {
      const p = new URLSearchParams();
      if (q) p.set('q', q);
      if (brand) p.set('brand', brand);
      if (category) p.set('category', category);
      if (encastre) p.set('encastre', encastre);
      p.set('limit', '48');
      const res = await fetch(`/api/products/search?${p.toString()}`, { signal: ctl.signal });
      const json = (await res.json()) as ApiResponse;
      setData(json);
    } catch (e) {
      if ((e as Error).name !== 'AbortError') console.error(e);
    } finally {
      setLoading(false);
    }
  }, [q, brand, category, encastre]);

  useEffect(() => {
    const t = setTimeout(fetchData, 180);
    return () => clearTimeout(t);
  }, [fetchData]);

  const activeFilters = useMemo(
    () =>
      [
        brand && { k: 'brand', v: brand, clear: () => setBrand(null) },
        category && { k: 'categoría', v: category, clear: () => setCategory(null) },
        encastre && { k: 'encastre', v: encastre, clear: () => setEncastre(null) },
      ].filter(Boolean) as Array<{ k: string; v: string; clear: () => void }>,
    [brand, category, encastre]
  );

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800">
      <header className="border-b bg-white">
        <div className="mx-auto flex max-w-6xl items-center gap-4 p-4">
          <h1 className="text-xl font-bold tracking-tight">TorqueTools — Catálogo</h1>
          <div className="ml-auto flex-1 max-w-md">
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Buscar por SKU, nombre, marca..."
              className="w-full rounded-lg border px-4 py-2 focus:outline-none focus:ring-2 focus:ring-blue-400"
            />
          </div>
          <span className="text-sm text-slate-500">
            {loading ? 'Buscando…' : `${data?.total ?? 0} productos`}
          </span>
        </div>
      </header>

      <main className="mx-auto grid max-w-6xl gap-6 p-4 md:grid-cols-[240px_1fr]">
        {/* Sidebar facetas */}
        <aside className="space-y-5">
          {activeFilters.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {activeFilters.map((f) => (
                <button
                  key={f.k}
                  onClick={f.clear}
                  className="rounded-full bg-blue-600 px-3 py-1 text-xs text-white"
                >
                  {f.k}: {f.v} ×
                </button>
              ))}
            </div>
          )}
          <FacetGroup
            title="Marca"
            items={data?.facets.brand || []}
            selected={brand}
            onSelect={setBrand}
          />
          <FacetGroup
            title="Categoría"
            items={data?.facets.category || []}
            selected={category}
            onSelect={setCategory}
          />
          <FacetGroup
            title="Encastre"
            items={data?.facets.encastre || []}
            selected={encastre}
            onSelect={setEncastre}
          />
        </aside>

        {/* Grid */}
        <section>
          {data && data.items.length === 0 && !loading && (
            <div className="rounded-lg border border-dashed bg-white p-10 text-center text-slate-500">
              No encontramos productos con esos filtros. Probá aflojar la búsqueda.
            </div>
          )}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {(data?.items || []).map((p) => (
              <button
                key={p.id}
                onClick={() => setSelected(p)}
                className="group rounded-lg border bg-white p-3 text-left transition hover:shadow-md"
              >
                <div className="aspect-square overflow-hidden rounded bg-slate-100">
                  <img
                    src={p.image_url || p.diagram_url || PLACEHOLDER_SVG}
                    alt={p.name}
                    className="h-full w-full object-contain transition group-hover:scale-105"
                    referrerPolicy="no-referrer"
                  />
                </div>
                <div className="mt-2 text-[11px] font-mono text-slate-500">{p.sku}</div>
                <div className="truncate text-sm font-medium">{p.name}</div>
                <div className="mt-1 flex items-center gap-2 text-xs">
                  {p.brand && (
                    <span className="rounded bg-slate-100 px-1.5 py-0.5">{p.brand}</span>
                  )}
                  {p.encastre && (
                    <span className="rounded bg-blue-50 px-1.5 py-0.5 text-blue-700">
                      {p.encastre}
                    </span>
                  )}
                </div>
                <div className="mt-1 text-sm font-semibold text-blue-700">
                  {fmtPrice(p.price_eur, 'EUR')}
                </div>
              </button>
            ))}
          </div>
        </section>
      </main>

      {selected && (
        <ProductModal product={selected} onClose={() => setSelected(null)} />
      )}
    </div>
  );
}

function FacetGroup({
  title,
  items,
  selected,
  onSelect,
}: {
  title: string;
  items: FacetItem[];
  selected: string | null;
  onSelect: (v: string | null) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  if (!items.length) return null;
  const visible = expanded ? items : items.slice(0, 8);
  return (
    <div className="rounded-lg border bg-white p-3">
      <div className="mb-2 text-xs font-semibold uppercase text-slate-500">{title}</div>
      <ul className="space-y-1 text-sm">
        {visible.map((i) => (
          <li key={i.value}>
            <button
              onClick={() => onSelect(selected === i.value ? null : i.value)}
              className={`flex w-full items-center justify-between rounded px-2 py-1 hover:bg-slate-50 ${
                selected === i.value ? 'bg-blue-50 text-blue-700 font-medium' : ''
              }`}
            >
              <span className="truncate">{i.value}</span>
              <span className="ml-2 text-xs text-slate-400">{i.count}</span>
            </button>
          </li>
        ))}
      </ul>
      {items.length > 8 && (
        <button
          onClick={() => setExpanded((e) => !e)}
          className="mt-2 text-xs text-blue-600 hover:underline"
        >
          {expanded ? 'Ver menos' : `Ver ${items.length - 8} más`}
        </button>
      )}
    </div>
  );
}

function ProductModal({ product, onClose }: { product: Product; onClose: () => void }) {
  const hasPhoto = !!product.image_url;
  const hasDiagram = !!product.diagram_url;
  const gallery = Array.isArray(product.gallery_urls) ? product.gallery_urls : [];

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={onClose}
    >
      <div
        className="max-h-[90vh] w-full max-w-4xl overflow-auto rounded-xl bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between border-b p-4">
          <div>
            <div className="text-[11px] font-mono text-slate-500">{product.sku}</div>
            <h2 className="text-lg font-bold">{product.name}</h2>
          </div>
          <button
            onClick={onClose}
            className="rounded-full p-2 text-slate-500 hover:bg-slate-100"
            aria-label="Cerrar"
          >
            ✕
          </button>
        </div>

        <div className="grid gap-6 p-6 md:grid-cols-2">
          {/* Foto principal + diagrama lado a lado (estilo APEX) */}
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="aspect-square overflow-hidden rounded border bg-slate-50">
                <img
                  src={product.image_url || PLACEHOLDER_SVG}
                  alt={`${product.name} foto`}
                  className="h-full w-full object-contain"
                  referrerPolicy="no-referrer"
                />
                <div className="bg-slate-50 px-2 py-1 text-center text-[10px] text-slate-500">
                  Foto producto
                </div>
              </div>
              <div className="aspect-square overflow-hidden rounded border bg-slate-50">
                <img
                  src={product.diagram_url || PLACEHOLDER_SVG}
                  alt={`${product.name} diagrama`}
                  className="h-full w-full object-contain"
                  referrerPolicy="no-referrer"
                />
                <div className="bg-slate-50 px-2 py-1 text-center text-[10px] text-slate-500">
                  Diagrama técnico
                </div>
              </div>
            </div>
            {!hasPhoto && !hasDiagram && (
              <div className="rounded bg-amber-50 p-2 text-xs text-amber-800">
                Este producto todavía no tiene fotos ni diagrama técnico cargados.
              </div>
            )}
            {gallery.length > 0 && (
              <div className="flex gap-2 overflow-x-auto">
                {gallery.map((g, i) => (
                  <img
                    key={i}
                    src={g.url}
                    alt={g.alt || ''}
                    className="h-16 w-16 rounded border bg-white object-contain"
                    referrerPolicy="no-referrer"
                  />
                ))}
              </div>
            )}
          </div>

          {/* Datos */}
          <div className="space-y-4">
            <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
              {product.brand && <Field label="Marca" value={product.brand} />}
              {product.category && <Field label="Categoría" value={product.category} />}
              {product.encastre && <Field label="Encastre" value={product.encastre} />}
              {product.modelo && <Field label="Modelo" value={product.modelo} />}
              {(product.torque_min || product.torque_max) && (
                <Field
                  label="Torque (Nm)"
                  value={`${product.torque_min ?? '—'} – ${product.torque_max ?? '—'}`}
                />
              )}
              {product.rpm && <Field label="RPM" value={product.rpm} />}
            </dl>

            <div className="rounded-lg bg-slate-50 p-3 text-sm">
              <div className="text-xs text-slate-500">Precios</div>
              <div className="flex flex-wrap gap-x-4 gap-y-1">
                <span>EUR: <b>{fmtPrice(product.price_eur, 'EUR')}</b></span>
                <span>USD: <b>{fmtPrice(product.price_usd, 'USD')}</b></span>
                <span>ARS: <b>{fmtPrice(product.price_ars, 'ARS')}</b></span>
              </div>
            </div>

            {product.specs && Object.keys(product.specs).length > 0 && (
              <details className="rounded-lg border p-3 text-sm">
                <summary className="cursor-pointer font-medium">Especificaciones técnicas</summary>
                <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
                  {Object.entries(product.specs)
                    .filter(([, v]) => v && v !== "'-" && v !== '-')
                    .map(([k, v]) => (
                      <div key={k} className="contents">
                        <dt className="text-slate-500">{k.replace(/_/g, ' ')}</dt>
                        <dd className="truncate">{String(v)}</dd>
                      </div>
                    ))}
                </dl>
              </details>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="contents">
      <dt className="text-slate-500">{label}</dt>
      <dd className="font-medium">{value}</dd>
    </div>
  );
}
