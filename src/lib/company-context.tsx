'use client'

import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { CompanyDisplay } from '@/types'

// =====================================================
// Country flag helper
// =====================================================
const COUNTRY_FLAGS: Record<string, string> = {
  ES: '\u{1F1EA}\u{1F1F8}',
  US: '\u{1F1FA}\u{1F1F8}',
  AR: '\u{1F1E6}\u{1F1F7}',
  DE: '\u{1F1E9}\u{1F1EA}',
  IT: '\u{1F1EE}\u{1F1F9}',
  FR: '\u{1F1EB}\u{1F1F7}',
  JP: '\u{1F1EF}\u{1F1F5}',
  BR: '\u{1F1E7}\u{1F1F7}',
  MX: '\u{1F1F2}\u{1F1FD}',
  CL: '\u{1F1E8}\u{1F1F1}',
  UY: '\u{1F1FA}\u{1F1FE}',
}

export function getCountryFlag(countryCode: string): string {
  return COUNTRY_FLAGS[countryCode?.toUpperCase()] || '\u{1F3F3}\u{FE0F}'
}

// =====================================================
// Context type
// =====================================================
interface CompanyContextType {
  /** Currently active company ID (single-company mode) */
  activeCompanyId: string | null
  /** All active company IDs (multi-company mode for admin) */
  activeCompanyIds: string[]
  /** Currently active company details */
  activeCompany: CompanyDisplay | null
  /** All companies the user has access to */
  companies: CompanyDisplay[]
  /**
   * REGLA DE ORO: empresas visibles según la selección del topbar.
   *   - Si isMultiMode → solo las que están en activeCompanyIds
   *   - Si no → solo la activeCompanyId
   * TODOS los selectores/filtros/listados del ERP deben usar esta lista,
   * NO la lista completa `companies`.
   */
  visibleCompanies: CompanyDisplay[]
  /** Switch active company */
  setActiveCompany: (id: string) => void
  /** Toggle a company in multi-select mode */
  toggleCompany: (id: string) => void
  /** Whether multi-company mode is active */
  isMultiMode: boolean
  /** Toggle multi-company mode */
  setMultiMode: (v: boolean) => void
  /** Loading state */
  loading: boolean
  /** Whether user is super admin (can see all companies) */
  isSuperAdmin: boolean
}

const CompanyContext = createContext<CompanyContextType>({
  activeCompanyId: null,
  activeCompanyIds: [],
  activeCompany: null,
  companies: [],
  visibleCompanies: [],
  setActiveCompany: () => {},
  toggleCompany: () => {},
  isMultiMode: false,
  setMultiMode: () => {},
  loading: true,
  isSuperAdmin: false,
})

export const useCompanyContext = () => useContext(CompanyContext)

// =====================================================
// Storage helpers
// =====================================================
const STORAGE_KEY = 'tt_active_company'
const STORAGE_MULTI_KEY = 'tt_active_companies'
const STORAGE_MULTI_MODE = 'tt_multi_mode'

function getStoredCompanyId(): string | null {
  if (typeof window === 'undefined') return null
  return localStorage.getItem(STORAGE_KEY)
}

function storeCompanyId(id: string) {
  if (typeof window === 'undefined') return
  localStorage.setItem(STORAGE_KEY, id)
}

function getStoredMultiIds(): string[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = localStorage.getItem(STORAGE_MULTI_KEY)
    return raw ? JSON.parse(raw) : []
  } catch {
    return []
  }
}

function storeMultiIds(ids: string[]) {
  if (typeof window === 'undefined') return
  localStorage.setItem(STORAGE_MULTI_KEY, JSON.stringify(ids))
}

function getStoredMultiMode(): boolean {
  if (typeof window === 'undefined') return false
  return localStorage.getItem(STORAGE_MULTI_MODE) === 'true'
}

function storeMultiMode(v: boolean) {
  if (typeof window === 'undefined') return
  localStorage.setItem(STORAGE_MULTI_MODE, String(v))
}

// =====================================================
// Provider
// =====================================================
export function CompanyProvider({ children }: { children: ReactNode }) {
  const [companies, setCompanies] = useState<CompanyDisplay[]>([])
  const [activeCompanyId, setActiveCompanyIdState] = useState<string | null>(null)
  const [activeCompanyIds, setActiveCompanyIdsState] = useState<string[]>([])
  const [isMultiMode, setIsMultiMode] = useState(false)
  const [loading, setLoading] = useState(true)
  const [isSuperAdmin, setIsSuperAdmin] = useState(false)

  // Fetch user's authorized companies
  const fetchCompanies = useCallback(async () => {
    try {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        setLoading(false)
        return
      }

      // Get tt_user record
      const { data: ttUser } = await supabase
        .from('tt_users')
        .select('id, role')
        .eq('auth_id', user.id)
        .single()

      if (!ttUser) {
        setLoading(false)
        return
      }

      // Check if super admin
      const { data: userRoles } = await supabase
        .from('tt_user_roles')
        .select('role:tt_roles(name)')
        .eq('user_id', ttUser.id)

      const roles = (userRoles || []).map(
        (ur: Record<string, unknown>) => (ur.role as Record<string, unknown>)?.name as string
      ).filter(Boolean)
      const isSuper = roles.includes('super_admin')
      setIsSuperAdmin(isSuper)

      // Get user's company access with company details
      const { data: userCompanies } = await supabase
        .from('tt_user_companies')
        .select(`
          id,
          user_id,
          company_id,
          is_default,
          can_sell,
          can_buy,
          company:tt_companies(id, name, country, currency, company_type)
        `)
        .eq('user_id', ttUser.id)

      if (!userCompanies || userCompanies.length === 0) {
        // Fallback: if no user_companies rows, use the user's company_id
        const { data: fallbackCompany } = await supabase
          .from('tt_companies')
          .select('id, name, country, currency, company_type')
          .eq('id', ttUser.id)
          .single()

        if (fallbackCompany) {
          const display: CompanyDisplay = {
            id: fallbackCompany.id,
            name: fallbackCompany.name,
            country: fallbackCompany.country,
            currency: fallbackCompany.currency,
            flag: getCountryFlag(fallbackCompany.country),
            company_type: (fallbackCompany.company_type || 'internal') as CompanyDisplay['company_type'],
            is_default: true,
            can_sell: true,
            can_buy: true,
          }
          setCompanies([display])
          setActiveCompanyIdState(display.id)
          storeCompanyId(display.id)
        }
        setLoading(false)
        return
      }

      // Map to CompanyDisplay
      const displayCompanies: CompanyDisplay[] = userCompanies.map((uc: Record<string, unknown>) => {
        const comp = uc.company as Record<string, unknown>
        return {
          id: comp.id as string,
          name: comp.name as string,
          country: (comp.country as string) || 'ES',
          currency: (comp.currency as string) || 'EUR',
          flag: getCountryFlag((comp.country as string) || 'ES'),
          company_type: ((comp.company_type as string) || 'internal') as CompanyDisplay['company_type'],
          is_default: uc.is_default as boolean,
          can_sell: uc.can_sell as boolean,
          can_buy: uc.can_buy as boolean,
        }
      })

      setCompanies(displayCompanies)

      // Restore from localStorage or use default
      const storedId = getStoredCompanyId()
      const storedMulti = getStoredMultiIds()
      const storedMultiMode = getStoredMultiMode()

      if (storedId && displayCompanies.some(c => c.id === storedId)) {
        setActiveCompanyIdState(storedId)
      } else {
        // Use default company
        const defaultCompany = displayCompanies.find(c => c.is_default) || displayCompanies[0]
        if (defaultCompany) {
          setActiveCompanyIdState(defaultCompany.id)
          storeCompanyId(defaultCompany.id)
        }
      }

      // Restore multi-mode state
      if (isSuper && storedMultiMode) {
        setIsMultiMode(true)
        const validMultiIds = storedMulti.filter(id => displayCompanies.some(c => c.id === id))
        setActiveCompanyIdsState(validMultiIds.length > 0 ? validMultiIds : displayCompanies.map(c => c.id))
      }
    } catch {
      // Silently handle errors
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchCompanies()
  }, [fetchCompanies])

  // Set active company (single mode)
  const setActiveCompany = useCallback((id: string) => {
    setActiveCompanyIdState(id)
    storeCompanyId(id)
    // Also update multi-ids if in multi mode
    if (isMultiMode) {
      setActiveCompanyIdsState([id])
      storeMultiIds([id])
    }
  }, [isMultiMode])

  // Toggle company in multi-select
  const toggleCompany = useCallback((id: string) => {
    setActiveCompanyIdsState(prev => {
      let next: string[]
      if (prev.includes(id)) {
        next = prev.filter(x => x !== id)
        // Don't allow empty selection
        if (next.length === 0) return prev
      } else {
        next = [...prev, id]
      }
      storeMultiIds(next)
      // Update single active to the first one
      if (next.length > 0) {
        setActiveCompanyIdState(next[0])
        storeCompanyId(next[0])
      }
      return next
    })
  }, [])

  // Toggle multi mode
  const setMultiMode = useCallback((v: boolean) => {
    setIsMultiMode(v)
    storeMultiMode(v)
    if (v) {
      // When entering multi mode, start with current active
      const ids = activeCompanyId ? [activeCompanyId] : companies.map(c => c.id)
      setActiveCompanyIdsState(ids)
      storeMultiIds(ids)
    }
  }, [activeCompanyId, companies])

  // Derive active company object
  const activeCompany = companies.find(c => c.id === activeCompanyId) || null

  // ═════════════════════════════════════════════════════════════════════
  // REGLA DE ORO: Empresas visibles según la selección del topbar.
  //   - isMultiMode = true → filtra por activeCompanyIds
  //   - single mode → solo la activeCompany
  // Todo selector del ERP DEBE usar esta lista, NUNCA `companies` completa.
  // ═════════════════════════════════════════════════════════════════════
  const effectiveIds = isMultiMode
    ? activeCompanyIds
    : activeCompanyId
      ? [activeCompanyId]
      : []
  const visibleCompanies = companies.filter(c => effectiveIds.includes(c.id))

  return (
    <CompanyContext.Provider
      value={{
        activeCompanyId,
        activeCompanyIds: isMultiMode ? activeCompanyIds : (activeCompanyId ? [activeCompanyId] : []),
        activeCompany,
        companies,
        visibleCompanies,
        setActiveCompany,
        toggleCompany,
        isMultiMode,
        setMultiMode,
        loading,
        isSuperAdmin,
      }}
    >
      {children}
    </CompanyContext.Provider>
  )
}
