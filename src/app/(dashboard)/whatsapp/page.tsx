'use client'

/** Más > WhatsApp Business — alias de /admin/whatsapp. */

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

export default function Page() {
  const router = useRouter()
  useEffect(() => { router.replace('/admin/whatsapp') }, [router])
  return <div className="p-8 text-sm text-[#6B7280]">Abriendo WhatsApp Business…</div>
}
