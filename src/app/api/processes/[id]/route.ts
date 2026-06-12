import { NextResponse } from 'next/server'
import {
  getProcessFull,
  advanceStage,
  updateProcessStatus,
  linkDocumentToProcess,
  recalculateProcess,
} from '@/lib/process-engine'
import type { ProcessStatus } from '@/types/process'
import { withCompanyFilter } from '@/lib/auth/with-company-filter'

// GET /api/processes/[id] — get full process with stages, docs, thread
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const guard = await withCompanyFilter()
    if (!guard.ok) return guard.response

    const { id } = await params
    const data = await getProcessFull(id)
    if (!data.process) {
      return NextResponse.json({ error: 'Process not found' }, { status: 404 })
    }
    const procCompanyId = (data.process as unknown as { company_id?: string }).company_id
    if (!guard.assertAccess(procCompanyId)) {
      return NextResponse.json({ error: 'Process not found' }, { status: 404 })
    }
    return NextResponse.json(data)
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 })
  }
}

// PATCH /api/processes/[id] — advance stage, update status, link doc, recalculate
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const guard = await withCompanyFilter()
    if (!guard.ok) return guard.response

    const { id } = await params

    // Verificar ownership
    const procData = await getProcessFull(id)
    if (!procData.process) {
      return NextResponse.json({ error: 'Process not found' }, { status: 404 })
    }
    const procCompanyId = (procData.process as unknown as { company_id?: string }).company_id
    if (!guard.assertAccess(procCompanyId)) {
      return NextResponse.json({ error: 'Process not found' }, { status: 404 })
    }

    const body = await request.json()
    const action = body.action as string

    switch (action) {
      case 'advance_stage': {
        const result = await advanceStage({
          process_instance_id: id,
          notes: body.notes,
          stage_data: body.stage_data,
          document_id: body.document_id,
          completed_by_user_id: body.user_id,
        })
        return NextResponse.json(result)
      }

      case 'update_status': {
        const result = await updateProcessStatus(
          id,
          body.status as ProcessStatus,
          body.user_id
        )
        return NextResponse.json(result)
      }

      case 'link_document': {
        await linkDocumentToProcess({
          process_instance_id: id,
          document_id: body.document_id,
          stage_code: body.stage_code,
          role: body.role,
        })
        return NextResponse.json({ success: true })
      }

      case 'recalculate': {
        const result = await recalculateProcess(id)
        return NextResponse.json(result)
      }

      default:
        return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 })
    }
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 })
  }
}
