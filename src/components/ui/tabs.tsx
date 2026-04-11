'use client'

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
  urlParam?: string // name of the URL search param to sync with
}

export function Tabs({ tabs, defaultTab, onChange, children, className, urlParam = 'tab' }: TabsProps) {
  const searchParams = useSearchParams()
  const router = useRouter()
  const pathname = usePathname()

  const urlTab = searchParams.get(urlParam)
  const validUrlTab = urlTab && tabs.some(t => t.id === urlTab) ? urlTab : null
  const initialTab = validUrlTab || defaultTab || tabs[0]?.id

  const [activeTab, setActiveTab] = useState(initialTab)

  // Sync from URL on mount and when URL changes
  useEffect(() => {
    if (validUrlTab && validUrlTab !== activeTab) {
      setActiveTab(validUrlTab)
    }
  }, [validUrlTab])

  const handleTabChange = (tabId: string) => {
    setActiveTab(tabId)
    onChange?.(tabId)

    // Update URL
    const params = new URLSearchParams(searchParams.toString())
    params.set(urlParam, tabId)
    router.replace(`${pathname}?${params.toString()}`, { scroll: false })
  }

  return (
    <div className={cn(className)}>
      <div className="flex gap-1 p-1 bg-[#0F1218] rounded-lg border border-[#1E2330] mb-4 overflow-x-auto scrollbar-hide">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => handleTabChange(tab.id)}
            className={cn(
              'flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-md transition-all whitespace-nowrap',
              activeTab === tab.id
                ? 'bg-[#1E2330] text-[#FF6600] shadow-sm'
                : 'text-[#6B7280] hover:text-[#9CA3AF]'
            )}
          >
            {tab.icon}
            {tab.label}
            {tab.badge !== undefined && tab.badge > 0 && (
              <span className="ml-1 px-1.5 py-0.5 text-[10px] rounded-full bg-[#FF6600] text-white">
                {tab.badge}
              </span>
            )}
          </button>
        ))}
      </div>
      <div>{children(activeTab)}</div>
    </div>
  )
}
