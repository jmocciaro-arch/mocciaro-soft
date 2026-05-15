'use client'

/** Más > Hub IA — alias de /ai-hub. */

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

export default function Page() {
  const router = useRouter()
  useEffect(() => { router.replace('/ai-hub') }, [router])
  return <div className="p-8 text-sm text-[#6B7280]">Abriendo Hub IA…</div>
}
