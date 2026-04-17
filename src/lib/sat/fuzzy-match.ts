/**
 * Helper de búsqueda tokenizada "por partes" tipo Algolia/fuzzy-search.
 *
 * Reglas:
 * - Normaliza: lowercase, sin tildes, trim.
 * - Divide el query en tokens (separados por espacios/guiones/comas).
 * - Cada token debe aparecer como SUBSTRING en el haystack.
 * - El orden de los tokens NO importa: "asm simpa" matchea "Grupo Simpa ASM18-3".
 * - Tokens muy cortos (< 2 chars) se ignoran salvo que sean números.
 *
 * Ejemplos:
 *   match("Grupo Simpa SRL — ASM18-3 W001", "simpa asm")    → true
 *   match("FEIN ASM18-3-PC",                "18-3")          → true
 *   match("FEIN ASM18-3-PC",                "asm 18 3")      → true
 *   match("WHIRLPOOL",                      "simp")          → false
 */

const NORM_CACHE = new Map<string, string>()

function normalize(s: string | null | undefined): string {
  if (!s) return ''
  const cached = NORM_CACHE.get(s)
  if (cached !== undefined) return cached
  const n = s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // remover tildes
    .trim()
  if (NORM_CACHE.size < 500) NORM_CACHE.set(s, n)
  return n
}

function tokenize(q: string): string[] {
  return normalize(q)
    .split(/[\s,;|/]+/)
    .filter((t) => t.length >= 2 || /^\d+$/.test(t))
}

/** True si cada token del query aparece como substring en el haystack (en cualquier orden). */
export function fuzzyMatch(haystack: string | null | undefined, query: string): boolean {
  if (!query || !query.trim()) return true
  const hay = normalize(haystack)
  const tokens = tokenize(query)
  if (!tokens.length) return true
  return tokens.every((t) => hay.includes(t))
}

/** Score: cantidad de tokens que matchean. Útil para ordenar. */
export function fuzzyScore(haystack: string | null | undefined, query: string): number {
  if (!query) return 0
  const hay = normalize(haystack)
  const tokens = tokenize(query)
  if (!tokens.length) return 0
  return tokens.filter((t) => hay.includes(t)).length
}

/** Filtra + ordena por relevancia. */
export function fuzzyFilter<T>(items: T[], query: string, getText: (item: T) => string | (string | null | undefined)[]): T[] {
  if (!query || !query.trim()) return items
  const tokens = tokenize(query)
  if (!tokens.length) return items

  const scored: Array<{ item: T; score: number; firstMatchIdx: number }> = []
  for (const item of items) {
    const raw = getText(item)
    const fullText = Array.isArray(raw) ? raw.filter(Boolean).join(' ') : raw || ''
    const hay = normalize(fullText as string)
    let matched = 0
    let firstIdx = Infinity
    for (const t of tokens) {
      const idx = hay.indexOf(t)
      if (idx >= 0) {
        matched++
        if (idx < firstIdx) firstIdx = idx
      }
    }
    if (matched === tokens.length) scored.push({ item, score: matched, firstMatchIdx: firstIdx })
  }

  // Ordenar: más matches primero, dentro de eso el que matchea antes (token en el inicio)
  scored.sort((a, b) => b.score - a.score || a.firstMatchIdx - b.firstMatchIdx)
  return scored.map((s) => s.item)
}
