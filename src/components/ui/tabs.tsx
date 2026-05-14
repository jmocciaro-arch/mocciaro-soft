'use client'

/**
 * Tabs — estilo StelOrder.
 *
 * - Sin pill ni fondo: tabs con underline naranja cuando activo.
 * - Borde inferior gris #E5E5E5 que conecta visualmente.
 * - Sincronizado con URL via `urlParam` (default "tab").
 */

import { useState, useEffect } from 'react'
import { useSearchParams, useRouter, usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'

interface Tab {
  id: string
  label: string
  icon?: React.ReactNode
  badge?: number
}

interface TabsProps {
  tabs: Tab[]
  defaultTab?: string
  onChange?: (tabId: string) => void
  children: (activeTab: string) => React.ReactNode
  className?: string
  urlParam?: string
}

export function Tabs({ tabs, defaultTab, onChange, children, className, urlParam = 'tab' }: TabsProps) {
  const searchParams = useSearchParams()
  const router = useRouter()
  const pathname = usePathname()

  const urlTab = searchParams.get(urlParam)
  const validUrlTab = urlTab && tabs.some(t => t.id === urlTab) ? urlTab : null
  const initialTab = validUrlTab || defaultTab || tabs[0]?.id

  const [activeTab, setActiveTab] = useState(initialTab)

  useEffect(() => {
    if (validUrlTab && validUrlTab !== activeTab) {
      setActiveTab(validUrlTab)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [validUrlTab])

  const handleTabChange = (tabId: string) => {
    setActiveTab(tabId)
    onChange?.(tabId)
    const params = new URLSearchParams(searchParams.toString())
    params.set(urlParam, tabId)
    router.replace(`${pathname}?${params.toString()}`, { scroll: false })
  }

  return (
    <div className={cn(className)}>
      <div className="flex gap-0 border-b border-[#E5E5E5] mb-4 overflow-x-auto scrollbar-hide">
        {tabs.map((tab) => {
          const active = activeTab === tab.id
          return (
            <button
              key={tab.id}
              onClick={() => handleTabChange(tab.id)}
              className={cn(
                'relative flex items-center gap-2 px-4 py-2.5 text-[13px] font-semibold transition-colors whitespace-nowrap -mb-px',
                active
                  ? 'text-[#FF6600] border-b-2 border-[#FF6600]'
                  : 'text-[#6B7280] hover:text-[#1F2937] border-b-2 border-transparent'
              )}
            >
              {tab.icon}
              {tab.label}
              {tab.badge !== undefined && tab.badge > 0 && (
                <span className={cn(
                  'ml-1 px-1.5 py-0.5 text-[10px] rounded-full font-bold',
                  active ? 'bg-[#FF6600] text-white' : 'bg-[#F3F4F6] text-[#374151]'
                )}>
                  {tab.badge}
                </span>
              )}
            </button>
          )
        })}
      </div>
      <div>{children(activeTab)}</div>
    </div>
  )
}
