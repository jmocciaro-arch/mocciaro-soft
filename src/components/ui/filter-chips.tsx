'use client'

export interface FilterChip {
  key: string
  label: string
}

interface FilterChipsProps {
  chips: FilterChip[]
  onRemove: (key: string) => void
  onClear: () => void
}

/**
 * Chips de filtros activos con × individual + "Limpiar filtros" (spec §2.1).
 * No renderiza nada sin filtros activos.
 */
export function FilterChips({ chips, onRemove, onClear }: FilterChipsProps) {
  if (chips.length === 0) return null
  return (
    <div className="flex items-center gap-1.5 flex-wrap">
      {chips.map(chip => (
        <span
          key={chip.key}
          className="inline-flex items-center gap-1 rounded-full bg-[#1E2330] text-[#F0F2F5] text-[11px] font-medium pl-2.5 pr-1 py-0.5"
        >
          {chip.label}
          <button
            type="button"
            aria-label={`Quitar filtro ${chip.label}`}
            onClick={() => onRemove(chip.key)}
            className="rounded-full px-1 leading-none hover:bg-[#2A3040] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#FF6600]"
          >
            ×
          </button>
        </span>
      ))}
      <button
        type="button"
        onClick={onClear}
        className="text-[11px] underline text-[#9CA3AF] hover:text-[#F0F2F5] px-1 py-0.5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#FF6600]"
      >
        Limpiar filtros
      </button>
    </div>
  )
}
