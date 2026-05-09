'use client'

import { SidebarProvider, Sidebar, TopBar, MobileNav, useSidebar } from '@/components/ui/sidebar'
import { ToastProvider } from '@/components/ui/toast'
import { CompanyProvider } from '@/lib/company-context'
import { AIAssistant } from '@/components/ai/ai-assistant'
import { CommandPalette } from '@/components/command-palette'
import { HelpAssistant } from '@/components/help/help-assistant'
import { cn } from '@/lib/utils'

function DashboardInner({ children }: { children: React.ReactNode }) {
  const { collapsed } = useSidebar()

  return (
    <div className="min-h-screen bg-[#0B0E13]">
      <Sidebar />
      <div
        className={cn(
          'transition-all duration-300',
          collapsed ? 'lg:ml-[72px]' : 'lg:ml-[224px]'
        )}
      >
        <TopBar userName="Juan" />
        <main className="p-4 lg:p-6 pb-28 lg:pb-6">
          {children}
        </main>
      </div>
      <MobileNav />
      <AIAssistant />
      <CommandPalette />
      <HelpAssistant />
    </div>
  )
}

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <ToastProvider>
      <CompanyProvider>
        <SidebarProvider>
          <DashboardInner>{children}</DashboardInner>
        </SidebarProvider>
      </CompanyProvider>
    </ToastProvider>
  )
}
