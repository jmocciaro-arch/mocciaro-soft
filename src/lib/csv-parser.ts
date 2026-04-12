/**
 * CSV / XLSX Parser — importacion de archivos con manejo completo de:
 * - Campos entre comillas
 * - Comas dentro de comillas
 * - Saltos de linea dentro de comillas
 * - BOM UTF-8
 * - Auto-deteccion de delimitador (coma, punto y coma, tab)
 * - XLSX via carga dinamica de SheetJS
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

/**
 * Lee un archivo como ArrayBuffer (para XLSX)
 */
export function readFileAsArrayBuffer(file: File): Promise<ArrayBuffer> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = (e) => resolve(e.target?.result as ArrayBuffer)
    reader.onerror = () => reject(new Error('Error al leer el archivo'))
    reader.readAsArrayBuffer(file)
  })
}

// ═══════════════════════════════════════════════════════
// XLSX SUPPORT via dynamic SheetJS loading
// ═══════════════════════════════════════════════════════

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let XLSX_LIB: any = null
let loadingPromise: Promise<void> | null = null

/**
 * Carga SheetJS dinamicamente desde CDN (solo cuando se necesita)
 */
async function loadSheetJS(): Promise<void> {
  if (XLSX_LIB) return
  if (loadingPromise) {
    await loadingPromise
    return
  }

  loadingPromise = new Promise<void>((resolve, reject) => {
    // Chequear si ya esta cargado globalmente
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if ((window as any).XLSX) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      XLSX_LIB = (window as any).XLSX
      resolve()
      return
    }

    const script = document.createElement('script')
    script.src = 'https://cdn.sheetjs.com/xlsx-0.20.3/package/dist/xlsx.full.min.js'
    script.async = true
    script.onload = () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      XLSX_LIB = (window as any).XLSX
      if (XLSX_LIB) {
        resolve()
      } else {
        reject(new Error('SheetJS no se cargo correctamente'))
      }
    }
    script.onerror = () => reject(new Error('No se pudo cargar la libreria de Excel. Verifica tu conexion a internet.'))
    document.head.appendChild(script)
  })

  await loadingPromise
}

/**
 * Parsea un archivo XLSX y lo convierte al mismo formato que parseCSV
 */
export async function parseXLSX(file: File): Promise<ParsedCSV> {
  await loadSheetJS()

  const buffer = await readFileAsArrayBuffer(file)
  const workbook = XLSX_LIB.read(buffer, { type: 'array' })

  // Usar la primera hoja
  const sheetName = workbook.SheetNames[0]
  if (!sheetName) {
    return { headers: [], rows: [], delimiter: '' }
  }

  const sheet = workbook.Sheets[sheetName]
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const jsonData: any[][] = XLSX_LIB.utils.sheet_to_json(sheet, { header: 1, defval: '' })

  if (!jsonData || jsonData.length === 0) {
    return { headers: [], rows: [], delimiter: '' }
  }

  const headers = jsonData[0].map((h: unknown) => String(h ?? '').trim())
  const rows = jsonData.slice(1).map((row: unknown[]) =>
    row.map((cell: unknown) => String(cell ?? '').trim())
  ).filter((row: string[]) => row.some(cell => cell !== ''))

  // Normalizar longitud de filas
  const colCount = headers.length
  const normalizedRows = rows.map((row: string[]) => {
    if (row.length < colCount) {
      return [...row, ...Array(colCount - row.length).fill('')]
    }
    if (row.length > colCount) {
      return row.slice(0, colCount)
    }
    return row
  })

  return { headers, rows: normalizedRows, delimiter: '' }
}

/**
 * Detecta si un archivo es XLSX
 */
export function isXLSXFile(file: File): boolean {
  const ext = file.name.split('.').pop()?.toLowerCase()
  return ext === 'xlsx' || ext === 'xls'
}
