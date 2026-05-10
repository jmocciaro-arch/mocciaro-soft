/**
 * Color por empresa.
 *
 * Como `tt_companies` no tiene una columna de color, derivamos uno determinístico
 * del nombre. Esto le da a cada empresa una "identidad visual" consistente en
 * la píldora del TopBar, los badges en listados y los nodos del workflow visual.
 *
 * Si en el futuro agregamos `tt_companies.brand_color`, este helper queda como
 * fallback.
 */

const PRESET_COLORS: Record<string, { hex: string; bg: string; border: string; text: string; flag: string }> = {
  // Mapeos manuales para las empresas conocidas (más prolijo que el hash)
  'TorqueTools': { hex: '#3B82F6', bg: 'bg-blue-500/15', border: 'border-blue-500/30', text: 'text-blue-400', flag: '🇪🇸' },
  'BuscaTools':  { hex: '#10B981', bg: 'bg-emerald-500/15', border: 'border-emerald-500/30', text: 'text-emerald-400', flag: '🇪🇸' },
  'Torquear':    { hex: '#EF4444', bg: 'bg-red-500/15', border: 'border-red-500/30', text: 'text-red-400', flag: '🇦🇷' },
  'JMJM':        { hex: '#F59E0B', bg: 'bg-amber-500/15', border: 'border-amber-500/30', text: 'text-amber-400', flag: '🇦🇷' },
  'Global':      { hex: '#8B5CF6', bg: 'bg-violet-500/15', border: 'border-violet-500/30', text: 'text-violet-400', flag: '🇺🇸' },
}

const FALLBACK_PALETTE = [
  { hex: '#3B82F6', bg: 'bg-blue-500/15',    border: 'border-blue-500/30',    text: 'text-blue-400',    flag: '🏢' },
  { hex: '#10B981', bg: 'bg-emerald-500/15', border: 'border-emerald-500/30', text: 'text-emerald-400', flag: '🏢' },
  { hex: '#F59E0B', bg: 'bg-amber-500/15',   border: 'border-amber-500/30',   text: 'text-amber-400',   flag: '🏢' },
  { hex: '#EF4444', bg: 'bg-red-500/15',     border: 'border-red-500/30',     text: 'text-red-400',     flag: '🏢' },
  { hex: '#8B5CF6', bg: 'bg-violet-500/15',  border: 'border-violet-500/30',  text: 'text-violet-400',  flag: '🏢' },
  { hex: '#EC4899', bg: 'bg-pink-500/15',    border: 'border-pink-500/30',    text: 'text-pink-400',    flag: '🏢' },
  { hex: '#06B6D4', bg: 'bg-cyan-500/15',    border: 'border-cyan-500/30',    text: 'text-cyan-400',    flag: '🏢' },
] as const

function hashString(s: string): number {
  let h = 0
  for (let i = 0; i < s.length; i++) {
    h = ((h << 5) - h) + s.charCodeAt(i)
    h |= 0
  }
  return Math.abs(h)
}

export function getCompanyColor(companyName: string | null | undefined) {
  if (!companyName) return FALLBACK_PALETTE[0]

  // Match prefix conocido
  for (const [key, color] of Object.entries(PRESET_COLORS)) {
    if (companyName.toLowerCase().includes(key.toLowerCase())) return color
  }

  // Fallback hash determinístico
  return FALLBACK_PALETTE[hashString(companyName) % FALLBACK_PALETTE.length]
}
