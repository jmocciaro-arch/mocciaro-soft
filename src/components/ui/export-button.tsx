'use client'

import { useState } from 'react'
import { Download, FileSpreadsheet, FileText, ArrowRightLeft } from 'lucide-react'
import { exportToCSV, exportToExcel, exportToCSVStelOrder, exportToExcelStelOrder } from '@/lib/export'
import { STELORDER_EXPORT_MAPPINGS } from '@/lib/stelorder-mappings'

interface ExportButtonProps {
  data: Record<string, unknown>[]
  filename: string
  columns?: { key: string; label: string }[]
  label?: string
  className?: string
  /** Nombre de la tabla Supabase para habilitar export StelOrder */
  targetTable?: string
}

export function ExportButton({ data, filename, columns, label = 'Exportar', className = '', targetTable }: ExportButtonProps) {
  const [open, setOpen] = useState(false)

  if (!data.length) return null

  const hasStelOrderMapping = targetTable && STELORDER_EXPORT_MAPPINGS[targetTable]

  return (
    <div className={`relative ${className}`}>
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2 px-3 py-2 text-sm font-medium text-muted-light bg-card border border-border-hover rounded-lg hover:bg-card hover:text-primary transition-all"
      >
        <Download size={16} />
        {label}
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-full mt-1 z-50 bg-card border border-border-hover rounded-lg shadow-xl overflow-hidden min-w-[220px]">

            {/* Standard export */}
            <div className="px-3 py-2 border-b border-border-hover">
              <p className="text-[10px] font-semibold text-muted uppercase tracking-wider">Formato Mocciaro Soft</p>
            </div>
            <button
              onClick={() => { exportToCSV(data, filename, columns); setOpen(false) }}
              className="w-full flex items-center gap-3 px-4 py-3 text-sm text-foreground hover:bg-border-hover transition-colors"
            >
              <FileText size={16} className="text-green-400" />
              Exportar CSV
            </button>
            <button
              onClick={() => { exportToExcel(data, filename, columns); setOpen(false) }}
              className="w-full flex items-center gap-3 px-4 py-3 text-sm text-foreground hover:bg-border-hover transition-colors border-t border-border-hover"
            >
              <FileSpreadsheet size={16} className="text-[#00C853]" />
              Exportar Excel
            </button>

            {/* StelOrder export */}
            {hasStelOrderMapping && targetTable && (
              <>
                <div className="px-3 py-2 border-t border-border-hover bg-blue-500/5">
                  <p className="text-[10px] font-semibold text-blue-400 uppercase tracking-wider flex items-center gap-1">
                    <ArrowRightLeft size={10} />
                    Formato StelOrder
                  </p>
                </div>
                <button
                  onClick={() => { exportToCSVStelOrder(data, filename, targetTable); setOpen(false) }}
                  className="w-full flex items-center gap-3 px-4 py-3 text-sm text-foreground hover:bg-blue-500/10 transition-colors"
                >
                  <FileText size={16} className="text-blue-400" />
                  CSV StelOrder
                </button>
                <button
                  onClick={() => { exportToExcelStelOrder(data, filename, targetTable); setOpen(false) }}
                  className="w-full flex items-center gap-3 px-4 py-3 text-sm text-foreground hover:bg-blue-500/10 transition-colors border-t border-border-hover"
                >
                  <FileSpreadsheet size={16} className="text-blue-400" />
                  Excel StelOrder
                </button>
              </>
            )}
          </div>
        </>
      )}
    </div>
  )
}
