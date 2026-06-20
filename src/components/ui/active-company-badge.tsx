'use client'

import { useCompanyContext } from '@/lib/company-context'

/**
 * Switcher visual de empresas en el header.
 * Muestra los logos de TODAS las empresas en fila.
 * - Activa: en color, borde naranja FEIN, escala 1
 * - Inactiva: en escala de grises (filter), opacidad 60%, sin borde
 * - Click: cambia la empresa activa (o togglea en multi-mode)
 * Si la empresa no tiene logo_url cae a un avatar con la inicial.
 */
export function ActiveCompanyBadge() {
  const {
    companies,
    activeCompanyId,
    activeCompanyIds,
    setActiveCompany,
    toggleCompany,
    isMultiMode,
  } = useCompanyContext()

  if (!companies.length) return null

  const isActive = (id: string) =>
    isMultiMode ? activeCompanyIds.includes(id) : id === activeCompanyId

  const onClick = (id: string) => {
    if (isMultiMode) toggleCompany(id)
    else setActiveCompany(id)
  }

  return (
    <div className="flex items-center gap-1.5 px-2 py-1 rounded-lg bg-[#0F1218] border border-[#1E2330] flex-shrink-0">
      {companies.map((c) => {
        const active = isActive(c.id)
        const initial = c.name.charAt(0).toUpperCase()
        return (
          <button
            key={c.id}
            type="button"
            onClick={() => onClick(c.id)}
            title={`${c.name}${active ? ' (activa)' : ''}`}
            aria-pressed={active}
            className="relative flex items-center justify-center rounded-md transition-all duration-150"
            style={{
              width: 32,
              height: 32,
              padding: 2,
              border: active ? '2px solid #FF6600' : '2px solid transparent',
              transform: active ? 'scale(1)' : 'scale(0.92)',
            }}
          >
            {(c.logo_iso_url || c.logo_url) ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={c.logo_iso_url || c.logo_url || ''}
                alt={c.name}
                className="w-full h-full object-contain rounded-sm transition-all duration-150"
                style={{
                  filter: active ? 'none' : 'grayscale(100%)',
                  opacity: active ? 1 : 0.55,
                  background: 'transparent',
                }}
              />
            ) : (
              <div
                className="w-full h-full flex items-center justify-center rounded-sm text-white text-xs font-bold transition-all duration-150"
                style={{
                  background: active ? '#FF6600' : '#3A4050',
                  opacity: active ? 1 : 0.6,
                  filter: active ? 'none' : 'grayscale(50%)',
                }}
              >
                {initial}
              </div>
            )}
            {active && c.flag && (
              <span
                className="absolute -bottom-1 -right-1 text-[10px] leading-none"
                style={{ textShadow: '0 0 3px rgba(0,0,0,0.6)' }}
              >
                {c.flag}
              </span>
            )}
          </button>
        )
      })}
    </div>
  )
}
