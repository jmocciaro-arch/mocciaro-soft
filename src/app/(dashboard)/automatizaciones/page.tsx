'use client'

/** Más > Automatizaciones — alias de /admin/automatizaciones. */

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

export default function Page() {
  const router = useRouter()
  useEffect(() => { router.replace('/admin/automatizaciones') }, [router])
  return <div className="p-8 text-sm text-[#6B7280]">Abriendo automatizaciones…</div>
}
