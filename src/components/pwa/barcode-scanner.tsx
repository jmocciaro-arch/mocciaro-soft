'use client';

// ============================================================================
// Mocciaro Soft ERP — Barcode Scanner
// Usa BarcodeDetector API (nativo en Chrome/Android) con fallback a input manual
// ============================================================================

import { useEffect, useRef, useState, useCallback } from 'react';
import { Camera, CameraOff, Search, X, Loader2, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

// ============================================================================
// Tipos
// ============================================================================

export interface ScannedProduct {
  id: string;
  name: string;
  sku: string;
  barcode: string;
  price: number;
  cost?: number;
  stock: number;
  imageUrl?: string;
  category?: string;
  unit?: string;
  description?: string;
  brand?: string;
  companyId?: string;
}

interface BarcodeScannerProps {
  companyId: string;
  onScanned?: (product: ScannedProduct) => void;
  className?: string;
}

// ============================================================================
// BarcodeDetector type declaration (no está en lib dom por defecto)
// ============================================================================

interface BarcodeDetectorResult {
  rawValue: string;
  format: string;
  boundingBox: DOMRectReadOnly;
  cornerPoints: Array<{ x: number; y: number }>;
}

interface BarcodeDetectorInstance {
  detect(image: ImageBitmapSource): Promise<BarcodeDetectorResult[]>;
}

interface BarcodeDetectorConstructor {
  new (options?: { formats?: string[] }): BarcodeDetectorInstance;
  getSupportedFormats(): Promise<string[]>;
}

declare global {
  interface Window {
    BarcodeDetector?: BarcodeDetectorConstructor;
  }
}

// ============================================================================
// Componente principal
// ============================================================================

export function BarcodeScanner({ companyId, onScanned, className }: BarcodeScannerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const detectorRef = useRef<BarcodeDetectorInstance | null>(null);
  const scanIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const lastScannedRef = useRef<string>('');
  const lastScannedTimeRef = useRef<number>(0);

  const [cameraActive, setCameraActive] = useState(false);
  const [cameraSupported, setCameraSupported] = useState(true);
  const [barcodeAPISupported, setBarcodeAPISupported] = useState(false);
  const [manualInput, setManualInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [scannedProduct, setScannedProduct] = useState<ScannedProduct | null>(null);
  const [scanLine, setScanLine] = useState(0);

  // Animación de la línea de escaneo
  useEffect(() => {
    if (!cameraActive) return;
    let dir = 1;
    const interval = setInterval(() => {
      setScanLine((prev) => {
        const next = prev + dir * 2;
        if (next >= 90) dir = -1;
        if (next <= 10) dir = 1;
        return next;
      });
    }, 16);
    return () => clearInterval(interval);
  }, [cameraActive]);

  // Verificar soporte de BarcodeDetector
  useEffect(() => {
    if (typeof window !== 'undefined' && window.BarcodeDetector) {
      setBarcodeAPISupported(true);
      try {
        detectorRef.current = new window.BarcodeDetector({
          formats: [
            'ean_13', 'ean_8', 'code_128', 'code_39', 'qr_code',
            'upc_a', 'upc_e', 'itf', 'data_matrix',
          ],
        });
      } catch {
        setBarcodeAPISupported(false);
      }
    } else {
      setBarcodeAPISupported(false);
    }
  }, []);

  // Buscar producto por código de barras
  const lookupProduct = useCallback(
    async (barcode: string) => {
      if (!barcode.trim()) return;

      // Evitar escaneos duplicados en menos de 3 segundos
      const now = Date.now();
      if (
        barcode === lastScannedRef.current &&
        now - lastScannedTimeRef.current < 3000
      ) {
        return;
      }
      lastScannedRef.current = barcode;
      lastScannedTimeRef.current = now;

      setIsLoading(true);
      setError(null);
      setScannedProduct(null);

      try {
        const params = new URLSearchParams({ barcode, companyId });
        const res = await fetch(`/api/products/scan?${params.toString()}`);
        const json = await res.json();

        if (!res.ok) {
          setError(
            res.status === 404
              ? `Producto no encontrado para el código: ${barcode}`
              : json.error || 'Error buscando el producto'
          );
          return;
        }

        const product = json as ScannedProduct;
        setScannedProduct(product);
        onScanned?.(product);
      } catch {
        setError('Error de red — verificá tu conexión');
      } finally {
        setIsLoading(false);
      }
    },
    [companyId, onScanned]
  );

  // Iniciar cámara
  const startCamera = useCallback(async () => {
    setError(null);
    setCameraActive(false);

    if (!navigator.mediaDevices?.getUserMedia) {
      setCameraSupported(false);
      setError('Tu dispositivo no soporta acceso a la cámara');
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: 'environment' }, // cámara trasera
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
      });

      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      setCameraActive(true);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes('NotAllowedError') || msg.includes('Permission')) {
        setError('Permiso de cámara denegado — habilitalo en la configuración del navegador');
      } else {
        setError('No se pudo acceder a la cámara');
      }
      setCameraSupported(false);
    }
  }, []);

  // Detener cámara
  const stopCamera = useCallback(() => {
    if (scanIntervalRef.current) {
      clearInterval(scanIntervalRef.current);
      scanIntervalRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setCameraActive(false);
  }, []);

  // Escanear frame del video con BarcodeDetector
  const scanFrame = useCallback(async () => {
    if (!detectorRef.current || !videoRef.current || !canvasRef.current) return;
    const video = videoRef.current;
    if (video.readyState < 2) return;

    try {
      const results = await detectorRef.current.detect(video);
      if (results.length > 0) {
        const barcode = results[0].rawValue;
        await lookupProduct(barcode);
      }
    } catch {
      // ignorar errores de detección de frame
    }
  }, [lookupProduct]);

  // Arrancar loop de escaneo cuando la cámara está activa y la API disponible
  useEffect(() => {
    if (cameraActive && barcodeAPISupported) {
      scanIntervalRef.current = setInterval(scanFrame, 300);
    }
    return () => {
      if (scanIntervalRef.current) clearInterval(scanIntervalRef.current);
    };
  }, [cameraActive, barcodeAPISupported, scanFrame]);

  // Cleanup al desmontar
  useEffect(() => {
    return () => stopCamera();
  }, [stopCamera]);

  const handleManualSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (manualInput.trim()) {
      lookupProduct(manualInput.trim());
    }
  };

  const clearResult = () => {
    setScannedProduct(null);
    setError(null);
    lastScannedRef.current = '';
  };

  // ============================================================================
  // Render
  // ============================================================================

  return (
    <div className={cn('flex flex-col gap-4', className)}>
      {/* Visor de cámara */}
      <div className="relative overflow-hidden rounded-2xl bg-[#0A0D12] border border-[#2A3040] aspect-[4/3] max-h-[60vh]">
        {cameraActive ? (
          <>
            <video
              ref={videoRef}
              playsInline
              muted
              autoPlay
              className="w-full h-full object-cover"
            />
            <canvas ref={canvasRef} className="hidden" />

            {/* Overlay con marco de escaneo */}
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              {/* Esquinas del marco */}
              <div className="relative w-3/4 max-w-[280px] aspect-[3/2]">
                <div className="absolute top-0 left-0 w-8 h-8 border-t-2 border-l-2 border-[#f97316] rounded-tl-sm" />
                <div className="absolute top-0 right-0 w-8 h-8 border-t-2 border-r-2 border-[#f97316] rounded-tr-sm" />
                <div className="absolute bottom-0 left-0 w-8 h-8 border-b-2 border-l-2 border-[#f97316] rounded-bl-sm" />
                <div className="absolute bottom-0 right-0 w-8 h-8 border-b-2 border-r-2 border-[#f97316] rounded-br-sm" />

                {/* Línea de escaneo animada */}
                {barcodeAPISupported && (
                  <div
                    className="absolute left-0 right-0 h-[2px] bg-gradient-to-r from-transparent via-[#f97316] to-transparent opacity-80 transition-none"
                    style={{ top: `${scanLine}%` }}
                  />
                )}
              </div>
            </div>

            {/* Etiqueta de estado */}
            <div className="absolute bottom-3 left-0 right-0 flex justify-center">
              <span className="px-3 py-1 bg-black/60 rounded-full text-xs text-[#f97316] backdrop-blur-sm">
                {barcodeAPISupported
                  ? 'Apuntá al código de barras'
                  : 'Cámara activa — ingresá el código manualmente'}
              </span>
            </div>

            {/* Botón cerrar */}
            <button
              onClick={stopCamera}
              className="absolute top-3 right-3 p-2 bg-black/60 rounded-full text-white hover:bg-black/80 transition-colors backdrop-blur-sm"
            >
              <X size={16} />
            </button>
          </>
        ) : (
          <div className="flex flex-col items-center justify-center h-full gap-4 p-6">
            <div className="w-16 h-16 rounded-2xl bg-[#1E2330] flex items-center justify-center">
              {cameraSupported ? (
                <Camera size={28} className="text-[#6B7280]" />
              ) : (
                <CameraOff size={28} className="text-[#6B7280]" />
              )}
            </div>
            <div className="text-center">
              <p className="text-[#F0F2F5] font-medium text-sm">
                {cameraSupported ? 'Escáner de código de barras' : 'Cámara no disponible'}
              </p>
              <p className="text-[#6B7280] text-xs mt-1">
                {cameraSupported
                  ? barcodeAPISupported
                    ? 'Usa la cámara para escanear automáticamente'
                    : 'Activá la cámara e ingresá el código manualmente'
                  : 'Usá el ingreso manual de abajo'}
              </p>
            </div>
            {cameraSupported && (
              <Button variant="primary" size="sm" onClick={startCamera}>
                <Camera size={14} />
                Activar cámara
              </Button>
            )}
          </div>
        )}
      </div>

      {/* Input manual */}
      <form onSubmit={handleManualSubmit} className="flex gap-2">
        <input
          type="text"
          value={manualInput}
          onChange={(e) => setManualInput(e.target.value)}
          placeholder="Ingresá código de barras o SKU..."
          className="flex-1 h-10 px-3 rounded-lg bg-[#1E2330] border border-[#2A3040] text-[#F0F2F5] text-sm placeholder:text-[#6B7280] focus:outline-none focus:border-[#f97316] transition-colors"
          inputMode="text"
          autoComplete="off"
          autoCorrect="off"
          spellCheck={false}
        />
        <Button
          type="submit"
          variant="primary"
          size="md"
          loading={isLoading}
          disabled={!manualInput.trim() || isLoading}
        >
          <Search size={14} />
          Buscar
        </Button>
      </form>

      {/* Loading state */}
      {isLoading && (
        <div className="flex items-center gap-2 text-[#6B7280] text-sm">
          <Loader2 size={14} className="animate-spin" />
          <span>Buscando producto...</span>
        </div>
      )}

      {/* Error */}
      {error && !isLoading && (
        <div className="flex items-start gap-2 p-3 rounded-lg bg-red-500/10 border border-red-500/20">
          <AlertCircle size={14} className="text-red-400 shrink-0 mt-0.5" />
          <p className="text-red-400 text-sm">{error}</p>
        </div>
      )}

      {/* Resultado del escaneo */}
      {scannedProduct && !isLoading && (
        <ProductResultCard product={scannedProduct} onClear={clearResult} />
      )}
    </div>
  );
}

// ============================================================================
// Card de resultado
// ============================================================================

interface ProductResultCardProps {
  product: ScannedProduct;
  onClear: () => void;
}

function ProductResultCard({ product, onClear }: ProductResultCardProps) {
  const stockVariant =
    product.stock <= 0 ? 'danger' : product.stock < 5 ? 'warning' : 'success';
  const stockLabel =
    product.stock <= 0 ? 'Sin stock' : product.stock < 5 ? 'Stock bajo' : 'En stock';

  return (
    <div className="rounded-xl bg-[#151821] border border-[#2A3040] p-4 relative">
      <button
        onClick={onClear}
        className="absolute top-3 right-3 p-1 rounded-lg hover:bg-[#1E2330] text-[#6B7280] transition-colors"
      >
        <X size={14} />
      </button>

      <div className="flex gap-3">
        {/* Imagen */}
        <div className="w-16 h-16 rounded-lg bg-[#1E2330] flex items-center justify-center overflow-hidden shrink-0">
          {product.imageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={product.imageUrl}
              alt={product.name}
              className="w-full h-full object-contain"
            />
          ) : (
            <span className="text-2xl">📦</span>
          )}
        </div>

        {/* Info */}
        <div className="flex-1 min-w-0 pr-6">
          <h3 className="text-[#F0F2F5] font-semibold text-sm leading-tight truncate">
            {product.name}
          </h3>
          <p className="text-[#6B7280] text-xs mt-0.5">{product.sku}</p>

          <div className="flex items-center gap-2 mt-2">
            <Badge variant={stockVariant} size="sm">
              {stockLabel}
            </Badge>
            {product.category && (
              <Badge variant="default" size="sm">
                {product.category}
              </Badge>
            )}
          </div>
        </div>
      </div>

      {/* Precio y stock */}
      <div className="grid grid-cols-2 gap-3 mt-4 pt-3 border-t border-[#2A3040]">
        <div>
          <p className="text-[#6B7280] text-[10px] uppercase tracking-wide">Precio</p>
          <p className="text-[#f97316] font-bold text-lg leading-tight">
            ${product.price?.toLocaleString('es-AR', { minimumFractionDigits: 2 })}
          </p>
          {product.unit && (
            <p className="text-[#6B7280] text-[10px]">por {product.unit}</p>
          )}
        </div>
        <div>
          <p className="text-[#6B7280] text-[10px] uppercase tracking-wide">Stock</p>
          <p
            className={cn(
              'font-bold text-lg leading-tight',
              product.stock <= 0
                ? 'text-red-400'
                : product.stock < 5
                  ? 'text-amber-400'
                  : 'text-emerald-400'
            )}
          >
            {product.stock} {product.unit || 'u.'}
          </p>
        </div>
      </div>

      {product.brand && (
        <p className="text-[#6B7280] text-xs mt-2">
          Marca: <span className="text-[#9CA3AF]">{product.brand}</span>
        </p>
      )}
    </div>
  );
}
