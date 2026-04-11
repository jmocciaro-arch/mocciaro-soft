'use client'

import { useState } from 'react'
import { Download, FileSpreadsheet, FileText } from 'lucide-react'
import { exportToCSV, exportToExcel } from '@/lib/export'

interface ExportButtonProps {
  data: Record<string, unknown>[]
  filename: string
  columns?: { key: string; label: string }[]
  label?: string
  className?: string
}

export function ExportButton({ data, filename, columns, label = 'Exportar', className = '' }: ExportButtonProps) {
  const [open, setOpen] = useState(false)

  if (!data.length) return null

  return (
    <div className={`relative ${className}`}>
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2 px-3 py-2 text-sm font-medium text-[#9CA3AF] bg-[#141820] border border-[#2A3040] rounded-lg hover:bg-[#1C2230] hover:text-[#FF6600] transition-all"
      >
        <Download size={16} />
        {label}
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-full mt-1 z-50 bg-[#1C2230] border border-[#2A3040] rounded-lg shadow-xl overflow-hidden min-w-[180px]">
            <button
              onClick={() => { exportToCSV(data, filename, columns); setOpen(false) }}
              className="w-full flex items-center gap-3 px-4 py-3 text-sm text-[#F0F2F5] hover:bg-[#2A3040] transition-colors"
            >
              <FileText size={16} className="text-green-400" />
              Exportar CSV
            </button>
            <button
              onClick={() => { exportToExcel(data, filename, columns); setOpen(false) }}
              className="w-full flex items-center gap-3 px-4 py-3 text-sm text-[#F0F2F5] hover:bg-[#2A3040] transition-colors border-t border-[#2A3040]"
            >
              <FileSpreadsheet size={16} className="text-[#00C853]" />
              Exportar Excel
            </button>
          </div>
        </>
      )}
    </div>
  )
}
