'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import { cn } from '@/lib/utils'
import { Search, ChevronDown, X, Loader2 } from 'lucide-react'
import { fuzzyFilter } from '@/lib/sat/fuzzy-match'

interface Option {
  value: string
  label: string
}

interface SearchableSelectProps {
  label?: string
  /** Static options (used when onSearch is NOT provided) */
  options?: Option[]
  value: string
  onChange: (value: string, label?: string) => void
  placeholder?: string
  disabled?: boolean
  className?: string
  /** Async search callback — when provided, options are loaded on-demand */
  onSearch?: (query: string) => Promise<Option[]>
  /** Minimum chars to trigger async search. Default: 2 */
  minSearchLength?: number
}

export function SearchableSelect({
  label,
  options: staticOptions,
  value,
  onChange,
  placeholder = 'Buscar...',
  disabled,
  className,
  onSearch,
  minSearchLength = 2,
}: SearchableSelectProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [search, setSearch] = useState('')
  const [asyncOptions, setAsyncOptions] = useState<Option[]>([])
  const [loading, setLoading] = useState(false)
  const [selectedLabel, setSelectedLabel] = useState('')
  const containerRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(null)

  // Determine which options to display
  const isAsync = !!onSearch
  const displayOptions = isAsync ? asyncOptions : (staticOptions || [])

  const filtered = !isAsync && search.trim()
    ? fuzzyFilter(displayOptions, search, (o) => o.label)
    : displayOptions

  // Resolve selected label
  useEffect(() => {
    if (!value) { setSelectedLabel(''); return }
    // Check static options first
    const found = (staticOptions || []).find(o => o.value === value)
    if (found) { setSelectedLabel(found.label); return }
    // Check async options
    const asyncFound = asyncOptions.find(o => o.value === value)
    if (asyncFound) { setSelectedLabel(asyncFound.label); return }
  }, [value, staticOptions, asyncOptions])

  // Async search with debounce
  useEffect(() => {
    if (!isAsync || !isOpen) return
    if (search.length < minSearchLength) {
      setAsyncOptions([])
      return
    }
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(async () => {
      setLoading(true)
      try {
        const results = await onSearch(search)
        setAsyncOptions(results)
      } catch {
        setAsyncOptions([])
      } finally {
        setLoading(false)
      }
    }, 300)
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current) }
  }, [search, isAsync, isOpen, onSearch, minSearchLength])

  const handleSelect = useCallback((optValue: string, optLabel: string) => {
    onChange(optValue, optLabel)
    setSelectedLabel(optLabel)
    setSearch('')
    setIsOpen(false)
  }, [onChange])

  const handleClear = () => {
    onChange('', '')
    setSelectedLabel('')
    setSearch('')
  }

  // Close on click outside
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false)
        setSearch('')
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  // Focus input when opening
  useEffect(() => {
    if (isOpen && inputRef.current) {
      inputRef.current.focus()
    }
  }, [isOpen])

  return (
    <div className={cn('w-full', className)} ref={containerRef}>
      {label && (
        <label className="block text-sm font-medium text-[#9CA3AF] mb-1.5">{label}</label>
      )}
      <div className="relative">
        {/* Display / Trigger */}
        <button
          type="button"
          disabled={disabled}
          onClick={() => setIsOpen(!isOpen)}
          className={cn(
            'w-full h-10 rounded-lg bg-[#1E2330] border border-[#2A3040] px-3 text-sm text-left flex items-center justify-between gap-2',
            'focus:outline-none focus:ring-2 focus:ring-orange-500/50 transition-all duration-200',
            'disabled:opacity-50 disabled:cursor-not-allowed',
            isOpen && 'ring-2 ring-orange-500/50 border-orange-500/50'
          )}
        >
          <span className={selectedLabel ? 'text-[#F0F2F5] truncate' : 'text-[#4B5563]'}>
            {selectedLabel || placeholder}
          </span>
          <div className="flex items-center gap-1 shrink-0">
            {value && !disabled && (
              <span
                onClick={(e) => { e.stopPropagation(); handleClear() }}
                className="p-0.5 rounded hover:bg-[#2A3040] text-[#6B7280] hover:text-[#F0F2F5] cursor-pointer"
              >
                <X size={14} />
              </span>
            )}
            <ChevronDown size={14} className={cn('text-[#6B7280] transition-transform', isOpen && 'rotate-180')} />
          </div>
        </button>

        {/* Dropdown */}
        {isOpen && (
          <div className="absolute z-50 mt-1 w-full bg-[#141820] border border-[#2A3040] rounded-lg shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            {/* Search input */}
            <div className="p-2 border-b border-[#1E2330]">
              <div className="relative">
                <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[#6B7280]" />
                <input
                  ref={inputRef}
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder={isAsync ? `Escribi al menos ${minSearchLength} letras...` : 'Escribi para buscar...'}
                  className="w-full h-8 pl-8 pr-3 rounded-md bg-[#1E2330] border border-[#2A3040] text-sm text-[#F0F2F5] placeholder:text-[#4B5563] focus:outline-none focus:ring-1 focus:ring-orange-500/50"
                />
                {loading && (
                  <Loader2 size={14} className="absolute right-2.5 top-1/2 -translate-y-1/2 animate-spin text-[#FF6600]" />
                )}
              </div>
            </div>
            {/* Options */}
            <div className="max-h-60 overflow-y-auto">
              {loading ? (
                <div className="px-3 py-4 text-sm text-[#6B7280] text-center flex items-center justify-center gap-2">
                  <Loader2 size={14} className="animate-spin" /> Buscando...
                </div>
              ) : isAsync && search.length < minSearchLength ? (
                <div className="px-3 py-4 text-sm text-[#6B7280] text-center">
                  Escribi el nombre del cliente para buscar
                </div>
              ) : filtered.length === 0 ? (
                <div className="px-3 py-4 text-sm text-[#6B7280] text-center">
                  Sin resultados{search && <> para &ldquo;{search}&rdquo;</>}
                </div>
              ) : (
                filtered.map(opt => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => handleSelect(opt.value, opt.label)}
                    className={cn(
                      'w-full text-left px-3 py-2 text-sm transition-colors',
                      opt.value === value
                        ? 'bg-orange-500/10 text-[#FF6600]'
                        : 'text-[#D1D5DB] hover:bg-[#1E2330]'
                    )}
                  >
                    {opt.label}
                  </button>
                ))
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
