/**
 * Genera URLs de tracking automáticos según el carrier.
 * Si el usuario carga solo el carrier + tracking number,
 * el sistema arma el link de rastreo.
 */

const CARRIER_PATTERNS: Record<string, {
  name: string
  aliases: string[]
  trackingUrl: (num: string) => string
  logo?: string
  color: string
}> = {
  dhl: {
    name: 'DHL',
    aliases: ['dhl', 'dhl express', 'dhl global', 'dhl freight'],
    trackingUrl: (num) => `https://www.dhl.com/ar-es/home/rastreo.html?tracking-id=${num}`,
    color: '#FFCC00',
  },
  ups: {
    name: 'UPS',
    aliases: ['ups', 'united parcel service'],
    trackingUrl: (num) => `https://www.ups.com/track?tracknum=${num}`,
    color: '#351C15',
  },
  fedex: {
    name: 'FedEx',
    aliases: ['fedex', 'fed ex', 'federal express'],
    trackingUrl: (num) => `https://www.fedex.com/fedextrack/?trknbr=${num}`,
    color: '#4D148C',
  },
  tnt: {
    name: 'TNT',
    aliases: ['tnt', 'tnt express'],
    trackingUrl: (num) => `https://www.tnt.com/express/es_ar/site/rastreo.html?searchType=con&cons=${num}`,
    color: '#FF6600',
  },
  oca: {
    name: 'OCA',
    aliases: ['oca', 'oca e-pak'],
    trackingUrl: (num) => `https://www.oca.com.ar/Envios/Tracking?piession=${num}`,
    color: '#003DA5',
  },
  andreani: {
    name: 'Andreani',
    aliases: ['andreani'],
    trackingUrl: (num) => `https://www.andreani.com/#!/informacionEnvio/${num}`,
    color: '#E30613',
  },
  correo_argentino: {
    name: 'Correo Argentino',
    aliases: ['correo argentino', 'correo', 'epak'],
    trackingUrl: (num) => `https://www.correoargentino.com.ar/formularios/e-commerce?id=${num}`,
    color: '#003B7E',
  },
  seur: {
    name: 'SEUR',
    aliases: ['seur'],
    trackingUrl: (num) => `https://www.seur.com/livetracking/?segOnlineIdentifier=${num}`,
    color: '#003DA6',
  },
  mrw: {
    name: 'MRW',
    aliases: ['mrw'],
    trackingUrl: (num) => `https://www.mrw.es/seguimiento_envios/MRW_resultados_702.asp?empresa=0&modo=N&num=${num}`,
    color: '#CC0033',
  },
  usps: {
    name: 'USPS',
    aliases: ['usps', 'us postal'],
    trackingUrl: (num) => `https://tools.usps.com/go/TrackConfirmAction?tLabels=${num}`,
    color: '#333366',
  },
}

/**
 * Dado un nombre de carrier (case insensitive), devuelve la config.
 */
export function resolveCarrier(input: string): typeof CARRIER_PATTERNS[string] | null {
  const normalized = input.toLowerCase().trim()
  for (const [, config] of Object.entries(CARRIER_PATTERNS)) {
    if (config.aliases.some((a) => normalized.includes(a))) return config
  }
  return null
}

/**
 * Genera la URL de tracking dado carrier + número.
 * Si el carrier no es reconocido, devuelve null.
 */
export function buildTrackingUrl(carrier: string, trackingNumber: string): string | null {
  if (!carrier || !trackingNumber) return null
  const config = resolveCarrier(carrier)
  if (!config) return null
  return config.trackingUrl(trackingNumber.trim())
}

/**
 * Lista de carriers soportados para select/dropdown.
 */
export const SUPPORTED_CARRIERS = Object.entries(CARRIER_PATTERNS).map(([key, config]) => ({
  value: key,
  label: config.name,
  color: config.color,
}))

/**
 * Auto-detecta el carrier por el formato del tracking number.
 */
export function detectCarrierFromTracking(trackingNumber: string): string | null {
  const num = trackingNumber.trim()
  if (/^\d{10,22}$/.test(num) && num.length >= 10) return 'dhl'     // DHL: 10-22 dígitos
  if (/^1Z[A-Z0-9]{16}$/i.test(num)) return 'ups'                    // UPS: 1Z + 16 chars
  if (/^\d{12,15}$/.test(num)) return 'fedex'                         // FedEx: 12-15 dígitos
  if (/^\d{9}$/.test(num)) return 'usps'                              // USPS: 9 dígitos
  return null
}
