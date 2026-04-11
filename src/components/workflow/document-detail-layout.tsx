'use client'

import { ArrowLeft } from 'lucide-react'
import { WorkflowArrowBar, type WorkflowStep } from './workflow-arrow-bar'
import { DocumentHeader } from './document-header'
import { CriticalAlertsPanel, type Alert } from './critical-alerts-panel'
import { DeliveryProgressCard } from './delivery-progress-card'
import { SupplierPurchasesCard, type SupplierPurchase } from './supplier-purchases-card'
import { StockSnapshotCard, type StockSnapshotItem } from './stock-snapshot-card'
import { PendingTasksCard, type PendingTask } from './pending-tasks-card'
import { InternalNotesCard, type InternalNote } from './internal-notes-card'

// Re-export types for convenience
export type { WorkflowStep, Alert, SupplierPurchase, StockSnapshotItem, PendingTask, InternalNote }

interface DocumentData {
  id: string
  type: string
  system_code: string
  display_ref: string
  status: string
  currency: string
  total: number
  subtotal: number
  tax_amount: number
  delivery_date?: string
  incoterm?: string
  payment_terms?: string
  created_at: string
}

interface ClientData {
  id: string
  company_name: string
  tax_id?: string
  country?: string
}

interface CompanyData {
  id: string
  name: string
  country?: string
}

interface ParentDocData {
  type: string
  ref: string
  id: string
}

interface DeliveryProgressData {
  clientName: string
  deliveredPct: number
  invoicedPct: number
  collectedPct: number
  ocRef?: string
  itemStatuses: { label: string; color: string }[]
}

interface TrackingSummaryItem {
  label: string
  value: string | number
  color?: string
}

interface DocumentDetailLayoutProps {
  // Workflow
  workflowSteps: WorkflowStep[]
  onStepClick?: (step: WorkflowStep) => void

  // Header
  document: DocumentData
  client?: ClientData
  company?: CompanyData
  assignedTo?: string
  parentDocs?: ParentDocData[]
  onRefChange?: (ref: string) => void

  // Left panel
  alerts?: Alert[]
  onAlertClick?: (alert: Alert) => void
  onAlertDismiss?: (alertId: string) => void
  deliveryProgress?: DeliveryProgressData
  purchases?: SupplierPurchase[]
  onPurchaseClick?: (purchase: SupplierPurchase) => void

  // Center - main content
  children: React.ReactNode

  // Right panel
  trackingSummary?: TrackingSummaryItem[]
  overallProgress?: number
  stockItems?: StockSnapshotItem[]
  warehouseName?: string
  tasks?: PendingTask[]
  onTaskToggle?: (taskId: string) => void
  onTaskClick?: (task: PendingTask) => void
  notes?: InternalNote[]
  onAddNote?: (content: string) => void

  // Right panel custom content (appended after stock/tasks/notes)
  rightPanelExtra?: React.ReactNode

  // Navigation
  onBack?: () => void
  backLabel?: string
}

export function DocumentDetailLayout({
  workflowSteps,
  onStepClick,
  document,
  client,
  company,
  assignedTo,
  parentDocs,
  onRefChange,
  alerts,
  onAlertClick,
  onAlertDismiss,
  deliveryProgress,
  purchases,
  onPurchaseClick,
  children,
  trackingSummary,
  overallProgress,
  stockItems,
  warehouseName,
  tasks,
  onTaskToggle,
  onTaskClick,
  notes,
  onAddNote,
  rightPanelExtra,
  onBack,
  backLabel = 'Volver',
}: DocumentDetailLayoutProps) {
  return (
    <div className="max-w-[1600px] mx-auto space-y-4 animate-fade-in">
      {/* Back button */}
      {onBack && (
        <button
          onClick={onBack}
          className="flex items-center gap-1.5 text-sm text-[#9CA3AF] hover:text-[#FF6600] transition-colors mb-1"
        >
          <ArrowLeft size={16} />
          {backLabel}
        </button>
      )}

      {/* Workflow Arrow Bar - Full Width */}
      <WorkflowArrowBar steps={workflowSteps} onStepClick={onStepClick} />

      {/* Three Column Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-[300px_1fr_280px] gap-4">
        {/* LEFT PANEL */}
        <div className="space-y-4 order-2 lg:order-1">
          {alerts && alerts.length > 0 && (
            <CriticalAlertsPanel
              alerts={alerts}
              onAlertClick={onAlertClick}
              onDismiss={onAlertDismiss}
            />
          )}

          {deliveryProgress && (
            <DeliveryProgressCard
              clientName={deliveryProgress.clientName}
              deliveredPct={deliveryProgress.deliveredPct}
              invoicedPct={deliveryProgress.invoicedPct}
              collectedPct={deliveryProgress.collectedPct}
              ocRef={deliveryProgress.ocRef}
              itemStatuses={deliveryProgress.itemStatuses}
            />
          )}

          {purchases && purchases.length > 0 && (
            <SupplierPurchasesCard
              purchases={purchases}
              onPurchaseClick={onPurchaseClick}
            />
          )}
        </div>

        {/* CENTER PANEL */}
        <div className="space-y-4 order-1 lg:order-2">
          <DocumentHeader
            document={document}
            client={client}
            company={company}
            assignedTo={assignedTo}
            parentDocs={parentDocs}
            onRefChange={onRefChange}
          />

          {children}

          {notes !== undefined && (
            <InternalNotesCard notes={notes || []} onAddNote={onAddNote} />
          )}
        </div>

        {/* RIGHT PANEL */}
        <div className="space-y-4 order-3">
          {/* Internal tracking summary */}
          {trackingSummary && trackingSummary.length > 0 && (
            <div className="bg-[#141820] rounded-xl border border-[#2A3040] p-4">
              <h3 className="text-xs font-bold text-[#F0F2F5] uppercase tracking-wide mb-3">
                Seguimiento interno
              </h3>
              <div className="space-y-2">
                {trackingSummary.map((item, i) => (
                  <div key={i} className="flex items-center justify-between">
                    <span className="text-[10px] text-[#6B7280]">{item.label}</span>
                    <span
                      className="text-xs font-bold"
                      style={{ color: item.color || '#F0F2F5' }}
                    >
                      {item.value}
                    </span>
                  </div>
                ))}

                {overallProgress !== undefined && (
                  <div className="pt-2 mt-2 border-t border-[#1E2330]">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-[10px] text-[#6B7280]">Avance general</span>
                      <span className="text-xs font-bold text-[#FFB300]">{overallProgress}%</span>
                    </div>
                    <div className="w-full h-2 bg-[#1E2330] rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full bg-gradient-to-r from-[#FF6600] to-[#FFB300] transition-all"
                        style={{ width: `${overallProgress}%` }}
                      />
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {stockItems && stockItems.length > 0 && (
            <StockSnapshotCard items={stockItems} warehouseName={warehouseName} />
          )}

          {tasks && tasks.length > 0 && (
            <PendingTasksCard
              tasks={tasks}
              onToggle={onTaskToggle}
              onTaskClick={onTaskClick}
            />
          )}

          {rightPanelExtra}
        </div>
      </div>
    </div>
  )
}
