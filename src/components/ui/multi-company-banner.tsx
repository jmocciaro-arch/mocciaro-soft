'use client'

import { useCompanyContext } from '@/lib/company-context'
import { AlertTriangle, X } from 'lucide-react'
import { useState } from 'react'
import { getCompanyColor } from '@/lib/company-colors'
import { cn } from '@/lib/utils'

/**
 * Banner amarillo que aparece cuando el usuario tiene varias empresas activas
 * a la vez. Es el "warning" que pidió Claude en el análisis de UX para evitar
 * que se cargue una factura a la empresa equivocada.
 */
export function MultiCompanyBanner() {
  const { isMultiMode, activeCompanyIds, companies, activeCompany, setMultiMode } = useCompanyContext()
  const [dismissed, setDismissed] = useState(false)

  if (!isMultiMode || activeCompanyIds.length <= 1 || dismissed) return null

  const activeNames = companies
    .filter(c => activeCompanyIds.includes(c.id))
    .map(c => c.name)

  const defaultName = activeCompany?.name ?? activeNames[0] ?? 'la primera de la lista'
  const defaultColor = getCompanyColor(defaultName)

  return (
    <div className="sticky top-0 z-40 bg-amber-500/15 border-b border-amber-500/30 backdrop-blur">
      <div className="px-4 lg:px-6 py-2 flex items-center gap-3">
        <AlertTriangle size={14} className="text-amber-400 shrink-0" />
        <div className="flex-1 text-xs text-amber-100">
          <span className="font-semibold">Modo multi-empresa activo</span>
          <span className="text-amber-200/70 mx-2">·</span>
          <span>Viendo datos de <span className="font-medium">{activeNames.length} empresas</span>: {activeNames.join(', ')}</span>
          <span className="text-amber-200/70 mx-2">·</span>
          <span>
            Los registros nuevos se crean en{' '}
            <span className={cn('px-1.5 py-0.5 rounded font-semibold', defaultColor.bg, defaultColor.text)}>
              {defaultName}
            </span>
          </span>
        </div>
        <button
          onClick={() => setMultiMode(false)}
          className="text-xs text-amber-200 hover:text-amber-100 underline underline-offset-2"
        >
          Salir del modo multi
        </button>
        <button
          onClick={() => setDismissed(true)}
          className="text-amber-300/70 hover:text-amber-100 transition-colors"
          title="Ocultar este aviso"
        >
          <X size={14} />
        </button>
      </div>
    </div>
  )
}
