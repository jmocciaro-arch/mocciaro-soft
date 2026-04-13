'use client'

import { useCompanyContext } from '@/lib/company-context'

/**
 * Hook that returns the active company IDs for filtering queries.
 *
 * Usage in components:
 * ```
 * const { companyIds, filterByCompany, isAllCompanies } = useCompanyFilter()
 *
 * // In queries:
 * let query = sb.from('tt_documents').select('*')
 * query = filterByCompany(query, 'company_id')
 * ```
 */
export function useCompanyFilter() {
  const { activeCompanyId, activeCompanyIds, isMultiMode, isSuperAdmin, companies } = useCompanyContext()

  // Get the list of company IDs to filter by
  const companyIds: string[] = isMultiMode
    ? activeCompanyIds
    : activeCompanyId
      ? [activeCompanyId]
      : []

  // Is "all companies" selected? (super admin with all companies)
  const isAllCompanies = isSuperAdmin && isMultiMode && companyIds.length === companies.length

  /**
   * Apply company filter to a Supabase query.
   * If all companies selected (admin), no filter is applied.
   * @param query - Supabase query builder
   * @param column - Column name for company_id (default: 'company_id')
   */
  function filterByCompany<T>(query: T, column = 'company_id'): T {
    if (isAllCompanies || companyIds.length === 0) return query // No filter
    if (companyIds.length === 1) {
      return (query as unknown as { eq: (col: string, val: string) => T }).eq(column, companyIds[0])
    }
    return (query as unknown as { in: (col: string, vals: string[]) => T }).in(column, companyIds)
  }

  /**
   * Get a single company ID for creating new records.
   */
  const defaultCompanyId = activeCompanyId || companyIds[0] || null

  return {
    companyIds,
    isAllCompanies,
    filterByCompany,
    defaultCompanyId,
    activeCompanyId,
  }
}
