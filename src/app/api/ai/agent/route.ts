import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { AgentExecutor } from '@/lib/ai/agent-executor'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// POST /api/ai/agent
// Body: { companyId, task, dryRun? }
export async function POST(request: NextRequest) {
  try {
    const body = await request.json() as {
      companyId: string
      task: string
      dryRun?: boolean
    }

    const { companyId, task, dryRun = false } = body

    if (!companyId || !task) {
      return NextResponse.json({ error: 'companyId y task son requeridos' }, { status: 400 })
    }

    // Create agent task record
    const { data: taskRecord, error: insertError } = await supabase
      .from('tt_agent_tasks')
      .insert({
        company_id: companyId,
        task_description: task,
        status: 'planning',
      })
      .select('id')
      .single()

    if (insertError) {
      console.error('Error creating agent task:', insertError.message)
    }

    const taskId = (taskRecord as { id: string } | null)?.id

    // Update status to executing
    if (taskId && !dryRun) {
      await supabase
        .from('tt_agent_tasks')
        .update({ status: 'executing' })
        .eq('id', taskId)
    }

    const executor = new AgentExecutor(companyId)
    const result = await executor.execute(task, dryRun)

    // Save result
    if (taskId) {
      await supabase
        .from('tt_agent_tasks')
        .update({
          status: dryRun ? 'pending' : 'completed',
          plan: result.plan,
          actions: result.actions,
          summary: result.summary,
          ai_provider: result.ai_provider,
          completed_at: dryRun ? null : new Date().toISOString(),
        })
        .eq('id', taskId)
    }

    return NextResponse.json({
      taskId,
      ...result,
      dryRun,
    })
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 })
  }
}

// GET /api/ai/agent?taskId=xxx — get task status
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const taskId = searchParams.get('taskId')

  if (!taskId) {
    return NextResponse.json({ error: 'taskId requerido' }, { status: 400 })
  }

  const { data, error } = await supabase
    .from('tt_agent_tasks')
    .select('*')
    .eq('id', taskId)
    .single()

  if (error || !data) {
    return NextResponse.json({ error: 'Tarea no encontrada' }, { status: 404 })
  }

  return NextResponse.json(data)
}
