'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { WizardShell, type WizardStep } from '@/components/admin/companies/wizard/wizard-shell'
import { TabIdentity } from '@/components/admin/companies/wizard/tab-identity'
import { TabFiscality } from '@/components/admin/companies/wizard/tab-fiscality'
import { TabAddresses } from '@/components/admin/companies/wizard/tab-addresses'
import { TabBanks } from '@/components/admin/companies/wizard/tab-banks'
import { TabRepresentatives } from '@/components/admin/companies/wizard/tab-representatives'
import { TabDocuments } from '@/components/admin/companies/wizard/tab-documents'

type CountryMeta = { country_code: string; country_name: string; currency_default: string; tax_id_label: string }

export default function NewCompanyPage() {
  const router = useRouter()
  const [companyId, setCompanyId] = useState<string | null>(null)
  const [country, setCountry] = useState<string>('ES')
  const [currency, setCurrency] = useState<string>('EUR')
  const [countries, setCountries] = useState<CountryMeta[]>([])

  useEffect(() => {
    fetch('/api/companies/country-schemas')
      .then((r) => r.json())
      .then((j) => setCountries(j.data ?? []))
  }, [])

  const onCreated = async (id: string) => {
    setCompanyId(id)
    // Refrescar el país/currency desde la empresa recién creada
    const res = await fetch(`/api/companies/${id}`)
    const json = await res.json()
    if (json.company) {
      setCountry(json.company.country)
      setCurrency(json.company.default_currency ?? json.company.currency ?? 'EUR')
    }
  }

  const steps: WizardStep[] = [
    {
      id: 'identity',
      label: 'Identidad',
      render: () => <TabIdentity countries={countries} companyId={companyId} onCreated={onCreated} />,
    },
    {
      id: 'fiscality',
      label: 'Fiscalidad',
      requiresCompanyId: true,
      render: () => companyId ? <TabFiscality companyId={companyId} country={country} /> : null,
    },
    {
      id: 'addresses',
      label: 'Direcciones',
      requiresCompanyId: true,
      render: () => companyId ? <TabAddresses companyId={companyId} defaultCountry={country} /> : null,
    },
    {
      id: 'banks',
      label: 'Bancos',
      requiresCompanyId: true,
      render: () => companyId ? <TabBanks companyId={companyId} defaultCountry={country} defaultCurrency={currency} /> : null,
    },
    {
      id: 'representatives',
      label: 'Representantes',
      requiresCompanyId: true,
      render: () => companyId ? <TabRepresentatives companyId={companyId} /> : null,
    },
    {
      id: 'documents',
      label: 'Documentos',
      requiresCompanyId: true,
      render: () => companyId ? <TabDocuments companyId={companyId} /> : null,
    },
  ]

  return (
    <div className="h-[calc(100vh-4rem)] flex flex-col">
      <div className="flex items-center justify-between px-6 py-4 border-b border-[#2A3040]">
        <div>
          <h1 className="text-xl font-semibold text-[#F0F2F5]">Nueva empresa</h1>
          <p className="text-xs text-gray-400 mt-0.5">
            El paso 1 crea la empresa. Los siguientes pasos se habilitan después.
          </p>
        </div>
      </div>
      <WizardShell
        steps={steps}
        companyId={companyId}
        onCancel={() => router.push('/admin')}
        onComplete={() => router.push('/admin')}
      />
    </div>
  )
}
