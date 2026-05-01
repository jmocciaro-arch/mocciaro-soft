'use client'

import { useState, useRef, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { useCompanyContext } from '@/lib/company-context'
import { cn } from '@/lib/utils'
import {
  Building2, ChevronDown, Check, Layers, Globe,
} from 'lucide-react'
import type { CompanyDisplay } from '@/types'

// =====================================================
// Currency badge colors
// =====================================================
const CURRENCY_COLORS: Record<string, string> = {
  EUR: 'bg-blue-500/15 text-blue-400 border-blue-500/25',
  USD: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/25',
  ARS: 'bg-cyan-500/15 text-cyan-400 border-cyan-500/25',
}

const TYPE_BADGES: Record<string, { label: string; className: string }> = {
  internal: { label: 'Grupo', className: 'bg-violet-500/15 text-violet-400 border-violet-500/25' },
  external: { label: 'Externo', className: 'bg-gray-500/15 text-gray-400 border-gray-500/25' },
}

// =====================================================
// CompanyCard - individual company in dropdown
// =====================================================
function CompanyCard({
  company,
  isActive,
  isMultiMode,
  isChecked,
  onSelect,
  onToggle,
}: {
  company: CompanyDisplay
  isActive: boolean
  isMultiMode: boolean
  isChecked: boolean
  onSelect: () => void
  onToggle: () => void
}) {
  const typeBadge = TYPE_BADGES[company.company_type] || TYPE_BADGES.internal

  return (
    <button
      onClick={isMultiMode ? onToggle : onSelect}
      className={cn(
        'w-full flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all text-left',
        isActive && !isMultiMode
          ? 'bg-[#FF6600]/10 border border-[#FF6600]/30'
          : 'hover:bg-[#1E2330] border border-transparent',
      )}
    >
      {/* Multi-mode checkbox */}
      {isMultiMode && (
        <div
          className={cn(
            'w-4 h-4 rounded border flex items-center justify-center shrink-0 transition-colors',
            isChecked
              ? 'bg-[#FF6600] border-[#FF6600]'
              : 'border-[#3A4050] bg-transparent'
          )}
        >
          {isChecked && <Check size={10} className="text-white" />}
        </div>
      )}

      {/* Flag */}
      <span className="text-lg shrink-0">{company.flag}</span>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className={cn(
            'text-sm font-medium truncate',
            isActive && !isMultiMode ? 'text-[#FF6600]' : 'text-[#F0F2F5]'
          )}>
            {company.name}
          </span>
        </div>
        <div className="flex items-center gap-1.5 mt-0.5">
          <span className={cn(
            'px-1.5 py-0 text-[9px] font-medium rounded border',
            CURRENCY_COLORS[company.currency] || CURRENCY_COLORS.EUR
          )}>
            {company.currency}
          </span>
          <span className={cn(
            'px-1.5 py-0 text-[9px] font-medium rounded border',
            typeBadge.className
          )}>
            {typeBadge.label}
          </span>
        </div>
      </div>

      {/* Active indicator */}
      {isActive && !isMultiMode && (
        <Check size={16} className="text-[#FF6600] shrink-0" />
      )}
    </button>
  )
}

// =====================================================
// CompanySelector - main component
// =====================================================
export function CompanySelector() {
  const {
    activeCompany,
    companies,
    setActiveCompany,
    toggleCompany,
    isMultiMode,
    setMultiMode,
    activeCompanyIds,
    loading,
    isSuperAdmin,
  } = useCompanyContext()

  const [open, setOpen] = useState(false)
  const [menuPos, setMenuPos] = useState<{ top: number; right: number } | null>(null)
  const [mounted, setMounted] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)

  // Portal target only on client
  useEffect(() => { setMounted(true) }, [])

  // Recalcular posición al abrir (y en resize/scroll)
  useEffect(() => {
    if (!open || !triggerRef.current) return
    const update = () => {
      const r = triggerRef.current!.getBoundingClientRect()
      setMenuPos({ top: r.bottom + 8, right: window.innerWidth - r.right })
    }
    update()
    window.addEventListener('scroll', update, true)
    window.addEventListener('resize', update)
    return () => {
      window.removeEventListener('scroll', update, true)
      window.removeEventListener('resize', update)
    }
  }, [open])

  // Close on click outside (considerando que el dropdown está en portal)
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      const target = e.target as Node
      const clickedTrigger = triggerRef.current?.contains(target)
      const clickedMenu = ref.current?.contains(target)
      if (!clickedTrigger && !clickedMenu) {
        setOpen(false)
      }
    }
    if (open) {
      document.addEventListener('mousedown', handleClickOutside)
      return () => document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [open])

  // Close on Escape
  useEffect(() => {
    function handleEscape(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false)
    }
    if (open) {
      document.addEventListener('keydown', handleEscape)
      return () => document.removeEventListener('keydown', handleEscape)
    }
  }, [open])

  if (loading || companies.length === 0) {
    return (
      <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-[#141820] border border-[#1E2330] animate-pulse">
        <Building2 size={16} className="text-[#3A4050]" />
        <div className="w-24 h-4 bg-[#1E2330] rounded" />
      </div>
    )
  }

  // If only 1 company, show static display
  if (companies.length === 1) {
    return (
      <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-[#141820] border border-[#1E2330]">
        <span className="text-sm">{activeCompany?.flag}</span>
        <span className="text-sm font-medium text-[#F0F2F5] hidden sm:block">
          {activeCompany?.name}
        </span>
        <span className={cn(
          'px-1.5 py-0 text-[9px] font-medium rounded border hidden sm:inline',
          CURRENCY_COLORS[activeCompany?.currency || 'EUR']
        )}>
          {activeCompany?.currency}
        </span>
      </div>
    )
  }

  const multiCount = isMultiMode ? activeCompanyIds.length : 0

  return (
    <div className="relative">
      {/* Trigger button */}
      <button
        ref={triggerRef}
        onClick={() => setOpen(!open)}
        className={cn(
          'flex items-center gap-2 px-3 py-1.5 rounded-lg border transition-all',
          open
            ? 'bg-[#1E2330] border-[#FF6600]/40 shadow-[0_0_12px_rgba(255,102,0,0.1)]'
            : 'bg-[#141820] border-[#1E2330] hover:border-[#2A3040]',
        )}
      >
        {isMultiMode ? (
          <>
            <Layers size={16} className="text-violet-400" />
            <span className="text-sm font-medium text-[#F0F2F5] hidden sm:block">
              Multi-empresa
            </span>
            <span className="flex items-center justify-center w-5 h-5 rounded-full bg-violet-500/20 text-violet-400 text-[10px] font-bold">
              {multiCount}
            </span>
          </>
        ) : (
          <>
            <span className="text-sm">{activeCompany?.flag}</span>
            <span className="text-sm font-medium text-[#F0F2F5] hidden sm:block max-w-[140px] truncate">
              {activeCompany?.name}
            </span>
            <span className={cn(
              'px-1.5 py-0 text-[9px] font-medium rounded border hidden md:inline',
              CURRENCY_COLORS[activeCompany?.currency || 'EUR']
            )}>
              {activeCompany?.currency}
            </span>
          </>
        )}
        <ChevronDown
          size={14}
          className={cn(
            'text-[#6B7280] transition-transform',
            open && 'rotate-180'
          )}
        />
      </button>

      {/* Dropdown — renderizado en portal para no quedar atrapado por stacking contexts/overflow */}
      {open && mounted && menuPos && createPortal(
        <div
          ref={ref}
          style={{ position: 'fixed', top: menuPos.top, right: menuPos.right, zIndex: 9999 }}
          className="w-[320px] bg-[#0F1218] border border-[#1E2330] rounded-xl shadow-2xl shadow-black/40 overflow-hidden">
          {/* Header */}
          <div className="px-4 py-3 border-b border-[#1E2330]">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Globe size={14} className="text-[#6B7280]" />
                <span className="text-xs font-medium text-[#6B7280] uppercase tracking-wider">
                  Empresas del grupo
                </span>
              </div>
              {isSuperAdmin && (
                <button
                  onClick={() => setMultiMode(!isMultiMode)}
                  className={cn(
                    'flex items-center gap-1.5 px-2 py-1 rounded-md text-[10px] font-medium transition-colors border',
                    isMultiMode
                      ? 'bg-violet-500/15 text-violet-400 border-violet-500/30'
                      : 'text-[#6B7280] hover:text-[#9CA3AF] border-[#2A3040] hover:bg-[#1E2330]'
                  )}
                >
                  <Layers size={12} />
                  Multi
                </button>
              )}
            </div>
          </div>

          {/* Company list */}
          <div className="p-2 max-h-[360px] overflow-y-auto space-y-0.5">
            {/* "Todas" option for super admin in multi mode */}
            {isMultiMode && isSuperAdmin && (
              <button
                onClick={() => {
                  const allIds = companies.map(c => c.id)
                  const allSelected = allIds.every(id => activeCompanyIds.includes(id))
                  if (allSelected) {
                    // Deselect all except first
                    companies.forEach((c, i) => {
                      if (i > 0 && activeCompanyIds.includes(c.id)) toggleCompany(c.id)
                    })
                  } else {
                    // Select all
                    companies.forEach(c => {
                      if (!activeCompanyIds.includes(c.id)) toggleCompany(c.id)
                    })
                  }
                }}
                className={cn(
                  'w-full flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all text-left mb-1',
                  'hover:bg-[#1E2330] border border-dashed border-[#2A3040]',
                )}
              >
                <div
                  className={cn(
                    'w-4 h-4 rounded border flex items-center justify-center shrink-0',
                    activeCompanyIds.length === companies.length
                      ? 'bg-[#FF6600] border-[#FF6600]'
                      : 'border-[#3A4050]'
                  )}
                >
                  {activeCompanyIds.length === companies.length && (
                    <Check size={10} className="text-white" />
                  )}
                </div>
                <Layers size={16} className="text-violet-400" />
                <span className="text-sm font-medium text-[#9CA3AF]">
                  Todas las empresas
                </span>
              </button>
            )}

            {companies.map((company) => (
              <CompanyCard
                key={company.id}
                company={company}
                isActive={company.id === activeCompany?.id}
                isMultiMode={isMultiMode}
                isChecked={activeCompanyIds.includes(company.id)}
                onSelect={() => {
                  setActiveCompany(company.id)
                  setOpen(false)
                }}
                onToggle={() => toggleCompany(company.id)}
              />
            ))}
          </div>

          {/* Footer info */}
          <div className="px-4 py-2 border-t border-[#1E2330] bg-[#0A0D12]">
            <p className="text-[10px] text-[#4A5060]">
              {isMultiMode
                ? `${activeCompanyIds.length} de ${companies.length} empresas activas`
                : 'Los datos se filtran por la empresa activa'
              }
            </p>
          </div>
        </div>,
        document.body
      )}
    </div>
  )
}
