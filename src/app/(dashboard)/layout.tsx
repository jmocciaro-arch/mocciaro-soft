'use client'

import { SidebarProvider } from '@/components/ui/sidebar'
import { ToastProvider } from '@/components/ui/toast'
import { CompanyProvider } from '@/lib/company-context'
import { AIAssistant } from '@/components/ai/ai-assistant'
import { CommandPalette } from '@/components/command-palette'
import { HelpAssistant } from '@/components/help/help-assistant'
import { MultiCompanyBanner } from '@/components/ui/multi-company-banner'
import { StelShell } from '@/components/shell/stel-shell'

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <ToastProvider>
      <CompanyProvider>
        <SidebarProvider>
          <StelShell userName="Juan">
            <MultiCompanyBanner />
            {children}
          </StelShell>
          <AIAssistant />
          <CommandPalette />
          <HelpAssistant />
        </SidebarProvider>
      </CompanyProvider>
    </ToastProvider>
  )
}
