'use client';

// ============================================================================
// Mocciaro Soft ERP — Página Scanner
// Escáner de código de barras para consulta rápida de stock y precio
// ============================================================================

import { useState, useCallback } from 'react';
import { QrCode, Package, Trash2, ShoppingCart, Clock } from 'lucide-react';
import { BarcodeScanner, type ScannedProduct } from '@/components/pwa/barcode-scanner';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useCompanyContext } from '@/lib/company-context';
import { cn } from '@/lib/utils';

const MAX_HISTORY = 10;

export default function ScannerPage() {
  const { activeCompanyId } = useCompanyContext();
  const [scanHistory, setScanHistory] = useState<ScannedProduct[]>([]);

  const handleScanned = useCallback((product: ScannedProduct) => {
    setScanHistory((prev) => {
      // Mover al tope si ya existe, sin duplicar
      const filtered = prev.filter((p) => p.id !== product.id);
      return [product, ...filtered].slice(0, MAX_HISTORY);
    });
  }, []);

  const clearHistory = () => setScanHistory([]);

  const handleAddToQuote = (product: ScannedProduct) => {
    // Navegar al cotizador con el producto pre-seleccionado
    const params = new URLSearchParams({
      addProduct: product.id,
      sku: product.sku,
    });
    window.location.href = `/cotizador?${params.toString()}`;
  };

  const companyId = activeCompanyId ?? '';

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-[#f97316]/10 flex items-center justify-center">
          <QrCode size={20} className="text-[#f97316]" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-[#F0F2F5]">Scanner</h1>
          <p className="text-sm text-[#6B7280]">
            Escaneá un código de barras para ver precio y stock al instante
          </p>
        </div>
      </div>

      {/* Scanner component */}
      <Card>
        <CardContent className="pt-1">
          {!companyId ? (
            <div className="py-8 flex flex-col items-center gap-2 text-center">
              <Package size={32} className="text-[#6B7280]" />
              <p className="text-[#F0F2F5] font-medium text-sm">
                Seleccioná una empresa para usar el scanner
              </p>
              <p className="text-[#6B7280] text-xs">
                Usá el selector de empresa en la barra superior
              </p>
            </div>
          ) : (
            <BarcodeScanner
              companyId={companyId}
              onScanned={handleScanned}
            />
          )}
        </CardContent>
      </Card>

      {/* Historial de escaneos */}
      {scanHistory.length > 0 && (
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Clock size={16} className="text-[#6B7280]" />
              <CardTitle className="text-base">Últimos {scanHistory.length} escaneos</CardTitle>
            </div>
            <Button variant="ghost" size="sm" onClick={clearHistory}>
              <Trash2 size={14} />
              Limpiar
            </Button>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {scanHistory.map((product) => (
                <ScanHistoryItem
                  key={`${product.id}-${product.barcode}`}
                  product={product}
                  onAddToQuote={handleAddToQuote}
                />
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Estado vacío del historial */}
      {scanHistory.length === 0 && companyId && (
        <div className="py-6 flex flex-col items-center gap-2 text-center">
          <div className="w-12 h-12 rounded-2xl bg-[#1E2330] flex items-center justify-center">
            <Clock size={20} className="text-[#6B7280]" />
          </div>
          <p className="text-[#6B7280] text-sm">
            Los productos escaneados aparecerán acá
          </p>
        </div>
      )}
    </div>
  );
}

// ============================================================================
// Item de historial
// ============================================================================

interface ScanHistoryItemProps {
  product: ScannedProduct;
  onAddToQuote: (product: ScannedProduct) => void;
}

function ScanHistoryItem({ product, onAddToQuote }: ScanHistoryItemProps) {
  const stockVariant =
    product.stock <= 0 ? 'danger' : product.stock < 5 ? 'warning' : 'success';

  return (
    <div className="flex items-center gap-3 p-3 rounded-lg bg-[#0F1218] border border-[#2A3040] hover:border-[#3A4050] transition-colors">
      {/* Miniatura */}
      <div className="w-10 h-10 rounded-lg bg-[#1E2330] flex items-center justify-center overflow-hidden shrink-0">
        {product.imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={product.imageUrl}
            alt={product.name}
            className="w-full h-full object-contain"
          />
        ) : (
          <Package size={16} className="text-[#6B7280]" />
        )}
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <p className="text-[#F0F2F5] text-sm font-medium truncate">{product.name}</p>
        <div className="flex items-center gap-2 mt-0.5">
          <span className="text-[#6B7280] text-xs">{product.sku}</span>
          <Badge variant={stockVariant} size="sm">
            {product.stock} u.
          </Badge>
        </div>
      </div>

      {/* Precio */}
      <div className="text-right shrink-0">
        <p className="text-[#f97316] font-semibold text-sm">
          ${product.price?.toLocaleString('es-AR', { minimumFractionDigits: 0 })}
        </p>
        <button
          onClick={() => onAddToQuote(product)}
          className={cn(
            'mt-1 flex items-center gap-1 text-[10px] text-[#6B7280] hover:text-[#f97316] transition-colors'
          )}
          title="Agregar al cotizador"
        >
          <ShoppingCart size={10} />
          Cotizar
        </button>
      </div>
    </div>
  );
}
