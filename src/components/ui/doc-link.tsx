'use client'

import { useRouter } from 'next/navigation'
import { FileText } from 'lucide-react'
import { cn } from '@/lib/utils'

interface DocLinkProps {
  docRef: string      // "COT-2026-0001" or system_code
  docId?: string      // UUID for direct navigation
  docType?: string    // coti, pedido, delivery_note, factura, etc.
  className?: string
  showIcon?: boolean
}

const PREFIX_TO_TYPE: Record<string, string> = {
  COT: 'coti',
  PED: 'pedido',
  ALB: 'delivery_note',
  FAC: 'factura',
  PAP: 'pap',
  REC: 'recepcion',
  FC: 'factura_compra',
  LEAD: 'lead',
  OC: 'oc_cliente',
}

function inferType(ref: string): string | undefined {
  const upper = ref.toUpperCase()
  for (const [prefix, type] of Object.entries(PREFIX_TO_TYPE)) {
    if (upper.startsWith(prefix + '-') || upper.startsWith(prefix + '_')) {
      return type
    }
  }
  return undefined
}

export function DocLink({ docRef, docId, docType, className, showIcon = false }: DocLinkProps) {
  const router = useRouter()

  const handleClick = (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()

    if (docId) {
      // If we have a direct ID, navigate to the document detail page
      router.push(`/documentos/${docId}`)
    } else {
      // Try to navigate by type + ref through search
      const type = docType || inferType(docRef)
      if (type) {
        // Navigate to the cotizador page with a search filter
        router.push(`/cotizador?search=${encodeURIComponent(docRef)}&type=${type}`)
      } else {
        router.push(`/cotizador?search=${encodeURIComponent(docRef)}`)
      }
    }
  }

  return (
    <button
      onClick={handleClick}
      className={cn(
        'inline-flex items-center gap-1 text-[#FF6600] hover:text-[#E55A00] font-medium',
        'hover:underline underline-offset-2 transition-colors cursor-pointer',
        'text-inherit',
        className
      )}
      title={`Ver documento ${docRef}`}
    >
      {showIcon && <FileText size={12} className="shrink-0" />}
      {docRef}
    </button>
  )
}
