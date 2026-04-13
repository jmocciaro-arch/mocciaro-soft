import { NextResponse } from 'next/server'
import {
  createProcessInstance,
  listProcesses,
} from '@/lib/process-engine'
import type { CreateProcessInput, ProcessType, ProcessStatus } from '@/types/process'

// GET /api/processes — list processes with optional filters
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const filters: {
      process_type?: ProcessType
      customer_id?: string
      company_id?: string
      current_status?: ProcessStatus
      limit?: number
    } = {}

    if (searchParams.get('process_type')) filters.process_type = searchParams.get('process_type') as ProcessType
    if (searchParams.get('customer_id')) filters.customer_id = searchParams.get('customer_id')!
    if (searchParams.get('company_id')) filters.company_id = searchParams.get('company_id')!
    if (searchParams.get('status')) filters.current_status = searchParams.get('status') as ProcessStatus
    if (searchParams.get('limit')) filters.limit = parseInt(searchParams.get('limit')!)

    const processes = await listProcesses(filters)
    return NextResponse.json(processes)
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 })
  }
}

// POST /api/processes — create a new process instance
export async function POST(request: Request) {
  try {
    const body = await request.json() as CreateProcessInput
    if (!body.process_type || !body.name) {
      return NextResponse.json({ error: 'process_type and name are required' }, { status: 400 })
    }
    const process = await createProcessInstance(body)
    return NextResponse.json(process, { status: 201 })
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 })
  }
}
