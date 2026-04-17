/**
 * Zod schemas para la Fase EMPRESAS de Mocciaro Soft.
 *
 * Prerequisito: `pnpm add zod` (no está instalado en package.json).
 *
 * Cada schema refleja una entidad de la migration v35:
 *   - tt_companies (core)
 *   - tt_company_fiscal_profiles
 *   - tt_company_addresses
 *   - tt_company_bank_accounts
 *   - tt_company_currencies
 *   - tt_company_legal_representatives
 *   - tt_company_documents
 *
 * Los schemas fiscales por país se validan de forma dinámica contra
 * tt_country_fiscal_schemas.fields (ver validateFiscalData).
 */

import { z } from 'zod'

// -----------------------------------------------------------------------------
// Enums / constantes
// -----------------------------------------------------------------------------

export const LEGAL_FORMS = [
  'SL', 'SA', 'SAS', 'SRL', 'LLC', 'CORP', 'S_CORP', 'SOLE_PROP',
  'PARTNERSHIP', 'EIRL', 'COOP', 'AUTONOMO', 'MONOTRIBUTO', 'OTHER',
] as const

export const SUPPORTED_COUNTRIES = ['ES', 'AR', 'US', 'MX', 'BR', 'CL', 'UY'] as const

export const ADDRESS_KINDS = ['fiscal', 'billing', 'shipping', 'warehouse', 'branch'] as const

export const LEGAL_REP_ROLES = [
  'administrador_unico', 'administrador_solidario', 'administrador_mancomunado',
  'presidente', 'director', 'apoderado', 'socio', 'ceo', 'cfo',
  'representante_legal', 'autorizado_firma', 'other',
] as const

export const DOC_KINDS = [
  'escritura_constitutiva', 'estatutos', 'poderes', 'alta_fiscal',
  'certificado_digital', 'firma_electronica', 'ticketbai_cert',
  'registro_mercantil', 'cuit_constancia', 'iibb_constancia',
  'ein_letter', 'articles_of_incorporation', 'operating_agreement',
  'cfdi_csd', 'rfc_constancia', 'cnpj_card', 'sintegra', 'rut_constancia',
  'logo', 'banner', 'signature_image', 'id_document', 'passport',
  'contract', 'addendum', 'other',
] as const

export const BANK_ACCOUNT_TYPES = ['checking', 'savings', 'payroll', 'usd', 'other'] as const

const MM_DD_REGEX = /^(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])$/
const ISO_CURRENCY_REGEX = /^[A-Z]{3}$/

// -----------------------------------------------------------------------------
// Core: tt_companies (create / update)
// -----------------------------------------------------------------------------

/**
 * Campos que el wizard envía en el paso "Identidad".
 * No incluye los legacy como address/city/phone — esos se mueven a
 * tt_company_addresses y tt_companies.phone se mantiene por compat.
 */
export const companyCreateSchema = z.object({
  name: z.string().trim().min(2, 'Nombre comercial requerido').max(120),
  legal_name: z.string().trim().min(2, 'Razón social requerida').max(200),
  trade_name: z.string().trim().max(120).optional().nullable(),
  tax_id: z.string().trim().min(3, 'Identificador fiscal requerido').max(32),
  tax_id_type: z.string().trim().max(16).optional().nullable(),
  country: z.enum(SUPPORTED_COUNTRIES),
  legal_form: z.enum(LEGAL_FORMS).optional().nullable(),
  primary_activity: z.string().trim().max(200).optional().nullable(),
  secondary_activities: z.array(z.string().trim().min(1)).max(20).optional().default([]),
  establishment_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
  fiscal_year_start: z.string().regex(MM_DD_REGEX, 'Formato MM-DD').optional().default('01-01'),
  timezone: z.string().trim().max(64).optional().default('Europe/Madrid'),
  default_currency: z.string().regex(ISO_CURRENCY_REGEX, 'Código ISO 4217 (3 letras)'),
  secondary_currencies: z.array(z.string().regex(ISO_CURRENCY_REGEX)).max(10).optional().default([]),
  code_prefix: z.string().trim().toUpperCase().length(2).optional().nullable(),
  brand_color: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional().default('#F97316'),
  logo_url: z.string().url().optional().nullable(),
  email_main: z.string().email().optional().nullable(),
  email_billing: z.string().email().optional().nullable(),
  email_notifications: z.string().email().optional().nullable(),
  phone: z.string().trim().max(40).optional().nullable(),
  website: z.string().url().optional().nullable(),
  company_type: z.enum(['internal', 'customer', 'supplier']).default('internal'),
  is_active: z.boolean().default(true),
})

export const companyUpdateSchema = companyCreateSchema.partial()

export type CompanyCreateInput = z.infer<typeof companyCreateSchema>
export type CompanyUpdateInput = z.infer<typeof companyUpdateSchema>

// -----------------------------------------------------------------------------
// Fiscal profile — validación dinámica por país
// -----------------------------------------------------------------------------

export const fiscalFieldTypes = ['text', 'select', 'boolean', 'date', 'array', 'number'] as const

export const fiscalFieldDescriptorSchema = z.object({
  key: z.string().min(1),
  label: z.string().min(1),
  type: z.enum(fiscalFieldTypes),
  required: z.boolean().optional().default(false),
  options: z.array(z.string()).optional(),
  group: z.string().optional(),
  hint: z.string().optional(),
})

export type FiscalFieldDescriptor = z.infer<typeof fiscalFieldDescriptorSchema>

export const fiscalProfileUpsertSchema = z.object({
  country_code: z.enum(SUPPORTED_COUNTRIES),
  tax_id: z.string().trim().min(3).max(32).optional().nullable(),
  tax_id_type: z.string().trim().max(16).optional().nullable(),
  data: z.record(z.string(), z.any()).default({}),
  is_complete: z.boolean().optional().default(false),
})

export type FiscalProfileUpsertInput = z.infer<typeof fiscalProfileUpsertSchema>

/**
 * Valida tax_id contra la regex declarada en tt_country_fiscal_schemas.
 * Devuelve { ok, message } — message solo si falla.
 * Normaliza antes de matchear: trim + uppercase (porque los regex están en mayúsculas).
 */
export function validateTaxIdRegex(
  taxId: string | null | undefined,
  regex: string | null | undefined,
  countryLabel: string
): { ok: boolean; message?: string } {
  if (!taxId) return { ok: false, message: `${countryLabel} requiere tax_id` }
  if (!regex) return { ok: true }
  const normalized = taxId.trim().toUpperCase()
  try {
    const re = new RegExp(regex)
    if (!re.test(normalized)) {
      return { ok: false, message: `Formato inválido para ${countryLabel}: "${taxId}" no cumple ${regex}` }
    }
    return { ok: true }
  } catch {
    // Regex corrupto en el diccionario — fallback permisivo con warning
    return { ok: true }
  }
}

/**
 * Valida `data` contra los descriptores de campo del país.
 * Devuelve { ok, errors, cleaned } — `cleaned` descarta keys no declaradas.
 */
export function validateFiscalData(
  data: Record<string, unknown>,
  descriptors: FiscalFieldDescriptor[]
): { ok: boolean; errors: Record<string, string>; cleaned: Record<string, unknown> } {
  const errors: Record<string, string> = {}
  const cleaned: Record<string, unknown> = {}

  for (const d of descriptors) {
    const raw = data[d.key]
    if (raw === undefined || raw === null || raw === '') {
      if (d.required) errors[d.key] = `${d.label} es obligatorio`
      continue
    }
    switch (d.type) {
      case 'text':
        if (typeof raw !== 'string') errors[d.key] = `${d.label} debe ser texto`
        else cleaned[d.key] = raw.trim()
        break
      case 'number':
        if (typeof raw === 'number') cleaned[d.key] = raw
        else if (typeof raw === 'string' && !isNaN(Number(raw))) cleaned[d.key] = Number(raw)
        else errors[d.key] = `${d.label} debe ser numérico`
        break
      case 'boolean':
        cleaned[d.key] = Boolean(raw)
        break
      case 'date':
        if (typeof raw === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(raw)) cleaned[d.key] = raw
        else errors[d.key] = `${d.label} debe ser fecha YYYY-MM-DD`
        break
      case 'select':
        if (d.options?.includes(String(raw))) cleaned[d.key] = raw
        else errors[d.key] = `${d.label}: valor fuera de opciones`
        break
      case 'array':
        if (Array.isArray(raw)) cleaned[d.key] = raw
        else errors[d.key] = `${d.label} debe ser array`
        break
    }
  }

  return { ok: Object.keys(errors).length === 0, errors, cleaned }
}

// -----------------------------------------------------------------------------
// Addresses
// -----------------------------------------------------------------------------

export const addressCreateSchema = z.object({
  kind: z.enum(ADDRESS_KINDS),
  label: z.string().trim().max(80).optional().nullable(),
  line1: z.string().trim().min(2).max(200),
  line2: z.string().trim().max(200).optional().nullable(),
  city: z.string().trim().min(1).max(100),
  state: z.string().trim().max(100).optional().nullable(),
  postal_code: z.string().trim().max(20).optional().nullable(),
  country_code: z.string().length(2).toUpperCase(),
  is_default: z.boolean().optional().default(false),
  geo_lat: z.number().min(-90).max(90).optional().nullable(),
  geo_lng: z.number().min(-180).max(180).optional().nullable(),
})

export const addressUpdateSchema = addressCreateSchema.partial()

export type AddressCreateInput = z.infer<typeof addressCreateSchema>

// -----------------------------------------------------------------------------
// Bank accounts
// -----------------------------------------------------------------------------

export const bankAccountCreateSchema = z.object({
  label: z.string().trim().max(80).optional().nullable(),
  bank_name: z.string().trim().min(1).max(120),
  account_type: z.enum(BANK_ACCOUNT_TYPES).default('checking'),
  account_number: z.string().trim().min(1).max(64),
  currency: z.string().regex(ISO_CURRENCY_REGEX),
  country_code: z.string().length(2).toUpperCase(),
  iban: z.string().trim().max(34).optional().nullable(),
  swift_bic: z.string().trim().max(11).optional().nullable(),
  cbu: z.string().trim().max(22).optional().nullable(),
  alias_cbu: z.string().trim().max(30).optional().nullable(),
  routing_number: z.string().trim().max(12).optional().nullable(),
  ach_type: z.string().trim().max(20).optional().nullable(),
  clabe: z.string().trim().max(18).optional().nullable(),
  pix_key: z.string().trim().max(120).optional().nullable(),
  pix_key_type: z.enum(['cpf', 'cnpj', 'email', 'phone', 'random']).optional().nullable(),
  holder_name: z.string().trim().max(120).optional().nullable(),
  holder_tax_id: z.string().trim().max(32).optional().nullable(),
  is_primary: z.boolean().optional().default(false),
  is_active: z.boolean().optional().default(true),
  routing_details: z.record(z.string(), z.any()).optional().default({}),
  notes: z.string().trim().max(1000).optional().nullable(),
}).refine(
  (v) => {
    if (v.country_code === 'ES' && !v.iban) return false
    if (v.country_code === 'AR' && !v.cbu && !v.alias_cbu) return false
    if (v.country_code === 'US' && !v.routing_number) return false
    if (v.country_code === 'MX' && !v.clabe) return false
    return true
  },
  { message: 'Falta el campo bancario específico del país (IBAN/CBU/routing/CLABE)' }
)

export const bankAccountUpdateSchema = bankAccountCreateSchema

export type BankAccountCreateInput = z.infer<typeof bankAccountCreateSchema>

// -----------------------------------------------------------------------------
// Currencies
// -----------------------------------------------------------------------------

export const companyCurrencyUpsertSchema = z.object({
  currency_code: z.string().regex(ISO_CURRENCY_REGEX),
  is_default: z.boolean().optional().default(false),
  is_active: z.boolean().optional().default(true),
  manual_rate: z.number().positive().optional().nullable(),
  rate_source: z.enum(['manual', 'afip_api', 'ecb', 'bcra', 'banxico', 'live_feed']).optional().nullable(),
  priority: z.number().int().min(0).max(999).optional().default(0),
  notes: z.string().max(500).optional().nullable(),
})

// -----------------------------------------------------------------------------
// Legal representatives
// -----------------------------------------------------------------------------

export const legalRepCreateSchema = z.object({
  full_name: z.string().trim().min(2).max(200),
  role: z.enum(LEGAL_REP_ROLES),
  tax_id: z.string().trim().max(32).optional().nullable(),
  tax_id_type: z.string().trim().max(16).optional().nullable(),
  nationality: z.string().length(2).toUpperCase().optional().nullable(),
  birth_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
  appointment_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
  end_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
  signing_authority: z.boolean().optional().default(false),
  powers_scope: z.string().max(2000).optional().nullable(),
  email: z.string().email().optional().nullable(),
  phone: z.string().max(40).optional().nullable(),
  notes: z.string().max(2000).optional().nullable(),
  is_active: z.boolean().optional().default(true),
})

export const legalRepUpdateSchema = legalRepCreateSchema.partial()

// -----------------------------------------------------------------------------
// Documents
// -----------------------------------------------------------------------------

export const documentCreateSchema = z.object({
  doc_kind: z.enum(DOC_KINDS),
  label: z.string().trim().min(1).max(200),
  description: z.string().max(2000).optional().nullable(),
  storage_bucket: z.string().default('company-documents'),
  storage_path: z.string().min(1),
  mime_type: z.string().max(120).optional().nullable(),
  size_bytes: z.number().int().nonnegative().optional().nullable(),
  checksum_sha256: z.string().regex(/^[a-f0-9]{64}$/).optional().nullable(),
  issued_at: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
  expires_at: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
  issuing_authority: z.string().max(200).optional().nullable(),
  reference_number: z.string().max(120).optional().nullable(),
  metadata: z.record(z.string(), z.any()).optional().default({}),
  is_active: z.boolean().optional().default(true),
})

export const documentUpdateSchema = documentCreateSchema.partial()
