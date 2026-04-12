/**
 * CSV Parser — importacion de archivos CSV con manejo completo de:
 * - Campos entre comillas
 * - Comas dentro de comillas
 * - Saltos de linea dentro de comillas
 * - BOM UTF-8
 * - Auto-deteccion de delimitador (coma, punto y coma, tab)
 */

export interface ParsedCSV {
  headers: string[]
  rows: string[][]
  delimiter: string
}

/**
 * Auto-detecta el delimitador analizando la primera linea
 */
function detectDelimiter(text: string): string {
  const firstLine = text.split('\n')[0] || ''
  const delimiters = [',', ';', '\t']
  let best = ','
  let bestCount = 0

  for (const d of delimiters) {
    // Contar ocurrencias fuera de comillas
    let count = 0
    let inQuotes = false
    for (const ch of firstLine) {
      if (ch === '"') inQuotes = !inQuotes
      else if (ch === d && !inQuotes) count++
    }
    if (count > bestCount) {
      bestCount = count
      best = d
    }
  }

  return best
}

/**
 * Parsea un string CSV respetando comillas, delimitadores, etc.
 */
function parseCSVString(text: string, delimiter: string): string[][] {
  const rows: string[][] = []
  let currentRow: string[] = []
  let currentField = ''
  let inQuotes = false
  let i = 0

  while (i < text.length) {
    const ch = text[i]

    if (inQuotes) {
      if (ch === '"') {
        if (i + 1 < text.length && text[i + 1] === '"') {
          // Escaped quote
          currentField += '"'
          i += 2
          continue
        } else {
          // End of quoted field
          inQuotes = false
          i++
          continue
        }
      } else {
        currentField += ch
        i++
        continue
      }
    }

    // Not in quotes
    if (ch === '"') {
      inQuotes = true
      i++
      continue
    }

    if (ch === delimiter) {
      currentRow.push(currentField.trim())
      currentField = ''
      i++
      continue
    }

    if (ch === '\r') {
      if (i + 1 < text.length && text[i + 1] === '\n') {
        i++ // Skip \r, will process \n next
        continue
      }
      // Standalone \r = end of row
      currentRow.push(currentField.trim())
      currentField = ''
      if (currentRow.some(f => f !== '')) rows.push(currentRow)
      currentRow = []
      i++
      continue
    }

    if (ch === '\n') {
      currentRow.push(currentField.trim())
      currentField = ''
      if (currentRow.some(f => f !== '')) rows.push(currentRow)
      currentRow = []
      i++
      continue
    }

    currentField += ch
    i++
  }

  // Last field/row
  if (currentField || currentRow.length > 0) {
    currentRow.push(currentField.trim())
    if (currentRow.some(f => f !== '')) rows.push(currentRow)
  }

  return rows
}

/**
 * Parsea un archivo CSV y retorna headers + rows
 */
export function parseCSV(text: string): ParsedCSV {
  // Remover BOM si existe
  let clean = text
  if (clean.charCodeAt(0) === 0xFEFF) {
    clean = clean.slice(1)
  }

  clean = clean.trim()
  if (!clean) return { headers: [], rows: [], delimiter: ',' }

  const delimiter = detectDelimiter(clean)
  const allRows = parseCSVString(clean, delimiter)

  if (allRows.length === 0) return { headers: [], rows: [], delimiter }

  const headers = allRows[0]
  const rows = allRows.slice(1)

  // Normalizar: asegurarse que todas las filas tengan la misma cantidad de columnas
  const colCount = headers.length
  const normalizedRows = rows.map(row => {
    if (row.length < colCount) {
      return [...row, ...Array(colCount - row.length).fill('')]
    }
    if (row.length > colCount) {
      return row.slice(0, colCount)
    }
    return row
  })

  return { headers, rows: normalizedRows, delimiter }
}

/**
 * Lee un archivo como texto
 */
export function readFileAsText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = (e) => resolve(e.target?.result as string || '')
    reader.onerror = () => reject(new Error('Error al leer el archivo'))
    reader.readAsText(file, 'UTF-8')
  })
}
