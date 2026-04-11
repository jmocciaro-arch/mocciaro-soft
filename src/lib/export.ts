/**
 * Export utilities — CSV and Excel export for any data table
 */

export function exportToCSV(data: Record<string, unknown>[], filename: string, columns?: { key: string; label: string }[]) {
  if (!data.length) return

  const cols = columns || Object.keys(data[0]).map(k => ({ key: k, label: k }))
  const header = cols.map(c => `"${c.label}"`).join(',')
  const rows = data.map(row =>
    cols.map(c => {
      const val = row[c.key]
      if (val === null || val === undefined) return '""'
      if (typeof val === 'object') return `"${JSON.stringify(val).replace(/"/g, '""')}"`
      return `"${String(val).replace(/"/g, '""')}"`
    }).join(',')
  )

  const csv = [header, ...rows].join('\n')
  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' })
  downloadBlob(blob, `${filename}.csv`)
}

export function exportToExcel(data: Record<string, unknown>[], filename: string, columns?: { key: string; label: string }[]) {
  // Simple Excel XML export (works without external libraries)
  if (!data.length) return

  const cols = columns || Object.keys(data[0]).map(k => ({ key: k, label: k }))

  let xml = '<?xml version="1.0"?>\n'
  xml += '<?mso-application progid="Excel.Sheet"?>\n'
  xml += '<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"\n'
  xml += ' xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">\n'
  xml += '<Styles>\n'
  xml += '<Style ss:ID="header"><Font ss:Bold="1" ss:Size="11"/><Interior ss:Color="#FF6600" ss:Pattern="Solid"/><Font ss:Color="#FFFFFF"/></Style>\n'
  xml += '<Style ss:ID="number"><NumberFormat ss:Format="#,##0.00"/></Style>\n'
  xml += '<Style ss:ID="date"><NumberFormat ss:Format="dd/mm/yyyy"/></Style>\n'
  xml += '</Styles>\n'
  xml += `<Worksheet ss:Name="${filename.substring(0, 30)}">\n<Table>\n`

  // Header row
  xml += '<Row>\n'
  cols.forEach(c => {
    xml += `<Cell ss:StyleID="header"><Data ss:Type="String">${escapeXml(c.label)}</Data></Cell>\n`
  })
  xml += '</Row>\n'

  // Data rows
  data.forEach(row => {
    xml += '<Row>\n'
    cols.forEach(c => {
      const val = row[c.key]
      if (val === null || val === undefined) {
        xml += '<Cell><Data ss:Type="String"></Data></Cell>\n'
      } else if (typeof val === 'number') {
        xml += `<Cell ss:StyleID="number"><Data ss:Type="Number">${val}</Data></Cell>\n`
      } else {
        xml += `<Cell><Data ss:Type="String">${escapeXml(String(val))}</Data></Cell>\n`
      }
    })
    xml += '</Row>\n'
  })

  xml += '</Table>\n</Worksheet>\n</Workbook>'

  const blob = new Blob([xml], { type: 'application/vnd.ms-excel' })
  downloadBlob(blob, `${filename}.xls`)
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

function escapeXml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}
