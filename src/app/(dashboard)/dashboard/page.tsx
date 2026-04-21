'use client'

import dynamic from 'next/dynamic'
import { DashboardMobile } from '@/components/dashboard/dashboard-mobile'

// Dynamic import para evitar SSR issues con react-grid-layout (usa window)
const DashboardGrid = dynamic(
  () => import('@/components/dashboard/dashboard-grid').then(mod => ({ default: mod.DashboardGrid })),
  {
    ssr: false,
    loading: () => (
      <div className="space-y-4 animate-fade-in">
        <div className="flex items-center justify-between">
          <div className="h-8 w-48 bg-[#141820] rounded-lg animate-pulse" />
          <div className="h-10 w-40 bg-[#141820] rounded-lg animate-pulse" />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map(i => (
            <div key={i} className="h-28 bg-[#141820] rounded-xl border border-[#1E2330] animate-pulse" />
          ))}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {[1, 2].map(i => (
            <div key={i} className="h-64 bg-[#141820] rounded-xl border border-[#1E2330] animate-pulse" />
          ))}
        </div>
      </div>
    ),
  }
)

export default function DashboardPage() {
  return (
    <>
      {/* Mobile: vista simplificada lineal, sin react-grid-layout */}
      <div className="lg:hidden">
        <DashboardMobile />
      </div>
      {/* Desktop/tablet grande: grid completo con widgets arrastrables */}
      <div className="hidden lg:block">
        <DashboardGrid />
      </div>
    </>
  )
}
