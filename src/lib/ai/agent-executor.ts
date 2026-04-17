import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export interface AgentAction {
  tool: string
  params: Record<string, unknown>
  result?: unknown
  error?: string
  status: 'pending' | 'success' | 'failed'
}

export interface AgentResult {
  plan: string[]
  actions: AgentAction[]
  summary: string
  ai_provider: string
}

// =====================================================
// AGENT TOOLS
// =====================================================

async function queryDB(
  table: string,
  filters: Record<string, unknown>
): Promise<unknown[]> {
  let query = supabase.from(table).select('*')

  for (const [key, value] of Object.entries(filters)) {
    if (key === '_limit') {
      query = query.limit(value as number)
    } else if (key === '_order') {
      const [col, dir] = (value as string).split(':')
      query = query.order(col, { ascending: dir !== 'desc' })
    } else if (key === '_eq' && typeof value === 'object') {
      const eqFilters = value as Record<string, unknown>
      for (const [col, val] of Object.entries(eqFilters)) {
        query = query.eq(col, val as string | number | boolean)
      }
    } else {
      query = query.eq(key, value as string | number | boolean)
    }
  }

  const { data, error } = await query.limit(50)
  if (error) throw new Error(`queryDB error: ${error.message}`)
  return data || []
}

async function draftEmail(
  to: string,
  subject: string,
  body: string,
  companyId: string
): Promise<string> {
  // Save to tt_generated_alerts as a draft email notification
  const { data, error } = await supabase
    .from('tt_generated_alerts')
    .insert({
      company_id: companyId,
      type: 'agent_draft_email',
      entity_type: 'email',
      title: subject,
      body: `Para: ${to}\n\n${body}`,
      severity: 'info',
      sent_email: false,
    })
    .select('id')
    .single()

  if (error) throw new Error(`draftEmail error: ${error.message}`)
  return (data as { id: string }).id
}

async function updateStatus(
  table: string,
  id: string,
  newStatus: string
): Promise<boolean> {
  const { error } = await supabase
    .from(table)
    .update({ status: newStatus, updated_at: new Date().toISOString() })
    .eq('id', id)

  if (error) throw new Error(`updateStatus error: ${error.message}`)
  return true
}

async function createAlert(
  title: string,
  body: string,
  severity: 'info' | 'warning' | 'danger' | 'success',
  companyId: string
): Promise<string> {
  const { data, error } = await supabase
    .from('tt_generated_alerts')
    .insert({
      company_id: companyId,
      type: 'agent_alert',
      title,
      body,
      severity,
    })
    .select('id')
    .single()

  if (error) throw new Error(`createAlert error: ${error.message}`)
  return (data as { id: string }).id
}

// =====================================================
// TASK PLANNER
// =====================================================

async function planTask(
  task: string,
  companyId: string,
  apiKey: string
): Promise<{ plan: string[]; taskType: string }> {
  const systemPrompt = `Sos un agente autónomo de ERP para una empresa argentina de herramientas industriales.

Tu trabajo es analizar la tarea que te piden y generar un plan de acción detallado.

Tareas que podés ejecutar:
- Consultar facturas vencidas y redactar emails de cobranza personalizados
- Buscar leads sin contacto reciente y redactar follow-ups
- Preparar resumen del cierre del mes
- Generar alertas para situaciones críticas

Respondé con JSON en este formato:
{
  "taskType": "cobranza|leads_followup|cierre_mes|generico",
  "plan": [
    "Paso 1: descripción clara de la acción",
    "Paso 2: ...",
    ...
  ]
}`

  const userPrompt = `Empresa ID: ${companyId}
Tarea: ${task}

Generá el plan de acción en JSON.`

  const geminiRes = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        system_instruction: { parts: [{ text: systemPrompt }] },
        contents: [{ role: 'user', parts: [{ text: userPrompt }] }],
        generationConfig: { maxOutputTokens: 1024, temperature: 0.2 },
      }),
    }
  )

  if (!geminiRes.ok) {
    throw new Error(`Gemini plan error: ${geminiRes.status}`)
  }

  const geminiData = await geminiRes.json()
  const raw = geminiData.candidates?.[0]?.content?.parts?.[0]?.text || ''

  try {
    const jsonMatch = raw.match(/\{[\s\S]*\}/)
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]) as { taskType: string; plan: string[] }
      return { plan: parsed.plan || [], taskType: parsed.taskType || 'generico' }
    }
  } catch {
    // fallback
  }

  return { plan: [`Ejecutar tarea: ${task}`], taskType: 'generico' }
}

// =====================================================
// TASK EXECUTORS
// =====================================================

async function executeCobranza(
  companyId: string,
  apiKey: string,
  actions: AgentAction[]
): Promise<void> {
  // 1) Get overdue invoices
  const overdueInvoices = await queryDB('tt_documents', {
    _eq: { company_id: companyId, type: 'factura' },
  }) as Array<Record<string, unknown>>

  const thirtyDaysAgo = new Date(Date.now() - 30 * 86400000).toISOString()
  const overdue = overdueInvoices.filter(
    (inv) =>
      ['emitida', 'autorizada', 'pendiente_cobro'].includes(inv.status as string) &&
      inv.invoice_date &&
      (inv.invoice_date as string) < thirtyDaysAgo
  )

  actions.push({
    tool: 'queryDB',
    params: { table: 'tt_documents', filter: 'facturas_vencidas' },
    result: `${overdue.length} facturas vencidas encontradas`,
    status: 'success',
  })

  if (overdue.length === 0) return

  // 2) Get client info
  const clientIds = [...new Set(overdue.map((i) => i.client_id).filter(Boolean))]
  const clients = await queryDB('tt_clients', { _eq: { company_id: companyId } }) as Array<Record<string, unknown>>
  const clientMap = new Map(clients.map((c) => [c.id, c]))

  // 3) Draft personalized emails per client
  const clientInvoices = new Map<string, Array<Record<string, unknown>>>()
  for (const inv of overdue) {
    const cid = inv.client_id as string
    if (!cid) continue
    if (!clientInvoices.has(cid)) clientInvoices.set(cid, [])
    clientInvoices.get(cid)!.push(inv)
  }

  for (const [clientId, invoices] of clientInvoices.entries()) {
    if (!clientIds.includes(clientId)) continue
    const client = clientMap.get(clientId) as Record<string, unknown> | undefined
    if (!client) continue

    const totalAmount = invoices.reduce((sum, i) => sum + Number(i.total || 0), 0)
    const currency = (invoices[0]?.currency as string) || 'EUR'
    const invoiceList = invoices
      .map((i) => `- Factura ${i.number || i.id}: ${currency} ${Number(i.total || 0).toFixed(2)} (fecha: ${i.invoice_date || 'N/A'})`)
      .join('\n')

    // Generate personalized email with AI
    const emailPrompt = `Redactá un email de cobranza amigable pero firme para el cliente "${client.name}".

Facturas vencidas:
${invoiceList}
Total: ${currency} ${totalAmount.toFixed(2)}

El email debe:
- Ser en español rioplatense (voseo)
- Ser profesional pero cordial
- Mencionar las facturas específicas
- Pedir confirmación de pago o fecha estimada
- Incluir datos de contacto genéricos
- No más de 150 palabras

Respondé SOLO con el cuerpo del email, sin asunto.`

    const emailRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ role: 'user', parts: [{ text: emailPrompt }] }],
          generationConfig: { maxOutputTokens: 512, temperature: 0.5 },
        }),
      }
    )

    let emailBody = `Estimados,\n\nNos comunicamos para recordarles que tienen facturas vencidas por un total de ${currency} ${totalAmount.toFixed(2)}.\n\n${invoiceList}\n\nAgradecemos su pronta respuesta.\n\nSaludos cordiales,\nEquipo de Cuentas por Cobrar`

    if (emailRes.ok) {
      const emailData = await emailRes.json()
      const raw = emailData.candidates?.[0]?.content?.parts?.[0]?.text || ''
      if (raw) emailBody = raw
    }

    const subject = `Recordatorio de pago - Facturas vencidas por ${currency} ${totalAmount.toFixed(2)}`
    const to = (client.email as string) || `${client.name}`

    try {
      const alertId = await draftEmail(to, subject, emailBody, companyId)
      actions.push({
        tool: 'draftEmail',
        params: { to, subject, clientId },
        result: `Email borrador creado (ID: ${alertId})`,
        status: 'success',
      })
    } catch (e) {
      actions.push({
        tool: 'draftEmail',
        params: { to, subject },
        error: (e as Error).message,
        status: 'failed',
      })
    }
  }
}

async function executeLeadsFollowup(
  companyId: string,
  apiKey: string,
  actions: AgentAction[]
): Promise<void> {
  // Get hot leads without recent contact
  const sevenDaysAgo = new Date(Date.now() - 7 * 86400000).toISOString()
  const leads = await queryDB('tt_leads', { _eq: { company_id: companyId, ai_temperature: 'hot' } }) as Array<Record<string, unknown>>

  const coldLeads = leads.filter(
    (l) => !l.last_contact_date || (l.last_contact_date as string) < sevenDaysAgo
  )

  actions.push({
    tool: 'queryDB',
    params: { table: 'tt_leads', filter: 'hot_sin_contacto_reciente' },
    result: `${coldLeads.length} leads hot sin contacto en 7+ días`,
    status: 'success',
  })

  for (const lead of coldLeads.slice(0, 10)) {
    const emailPrompt = `Redactá un email de seguimiento para el lead "${lead.name || lead.company_name}".

Información del lead:
- Empresa: ${lead.company_name || 'N/A'}
- Temperatura: HOT
- Último contacto: ${lead.last_contact_date || 'Sin registro'}
- Interés: ${lead.notes || 'herramientas industriales'}

El email debe:
- Ser en español rioplatense (voseo)
- Ser casual pero profesional
- Recordar el último contacto o propuesta
- Ofrecer una demo o reunión
- No más de 100 palabras

Respondé SOLO con el cuerpo del email.`

    const emailRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ role: 'user', parts: [{ text: emailPrompt }] }],
          generationConfig: { maxOutputTokens: 256, temperature: 0.6 },
        }),
      }
    )

    let emailBody = `Hola ${lead.name || 'equipo'},\n\nQueremos retomar el contacto y saber cómo podemos ayudarlos. ¿Tienen disponibilidad para una breve charla esta semana?\n\nSaludos,`

    if (emailRes.ok) {
      const emailData = await emailRes.json()
      const raw = emailData.candidates?.[0]?.content?.parts?.[0]?.text || ''
      if (raw) emailBody = raw
    }

    try {
      const alertId = await draftEmail(
        (lead.email as string) || String(lead.name || 'lead'),
        `Seguimiento - ${lead.company_name || lead.name}`,
        emailBody,
        companyId
      )
      actions.push({
        tool: 'draftEmail',
        params: { leadId: lead.id, name: lead.name },
        result: `Email borrador creado (ID: ${alertId})`,
        status: 'success',
      })
    } catch (e) {
      actions.push({
        tool: 'draftEmail',
        params: { leadId: lead.id },
        error: (e as Error).message,
        status: 'failed',
      })
    }
  }
}

async function executeCierreMes(
  companyId: string,
  actions: AgentAction[]
): Promise<void> {
  const now = new Date()
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString()

  const [invoices, orders, leads] = await Promise.all([
    queryDB('tt_documents', { _eq: { company_id: companyId, type: 'factura' } }),
    queryDB('tt_sales_orders', { _eq: { company_id: companyId } }),
    queryDB('tt_leads', { _eq: { company_id: companyId } }),
  ]) as [Array<Record<string, unknown>>, Array<Record<string, unknown>>, Array<Record<string, unknown>>]

  const monthInvoices = invoices.filter(
    (i) => i.invoice_date && (i.invoice_date as string) >= monthStart
  )
  const cobradas = monthInvoices.filter((i) => i.status === 'cobrada')
  const pendientes = monthInvoices.filter((i) =>
    ['emitida', 'autorizada', 'pendiente_cobro'].includes(i.status as string)
  )
  const totalCobrado = cobradas.reduce((s, i) => s + Number(i.total || 0), 0)
  const totalPendiente = pendientes.reduce((s, i) => s + Number(i.total || 0), 0)

  actions.push({
    tool: 'queryDB',
    params: { table: 'tt_documents', filter: 'mes_actual' },
    result: `${monthInvoices.length} facturas este mes: ${cobradas.length} cobradas (${totalCobrado.toFixed(2)}), ${pendientes.length} pendientes (${totalPendiente.toFixed(2)})`,
    status: 'success',
  })

  const monthOrders = (orders as Array<Record<string, unknown>>).filter(
    (o) => o.created_at && (o.created_at as string) >= monthStart
  )

  const summary = `Cierre del mes:
- Facturas emitidas: ${monthInvoices.length}
- Cobradas: ${cobradas.length} (${totalCobrado.toFixed(2)})
- Pendientes de cobro: ${pendientes.length} (${totalPendiente.toFixed(2)})
- Pedidos del mes: ${monthOrders.length}
- Leads activos: ${(leads as Array<Record<string, unknown>>).length}`

  const alertId = await createAlert(
    `Resumen de cierre - ${now.toLocaleDateString('es-AR', { month: 'long', year: 'numeric' })}`,
    summary,
    'info',
    companyId
  )

  actions.push({
    tool: 'createAlert',
    params: { type: 'cierre_mes' },
    result: `Alerta de cierre creada (ID: ${alertId})`,
    status: 'success',
  })
}

// =====================================================
// MAIN EXECUTOR
// =====================================================

export class AgentExecutor {
  private companyId: string
  private apiKey: string

  constructor(companyId: string) {
    this.companyId = companyId
    const key = process.env.GEMINI_API_KEY
    if (!key) throw new Error('GEMINI_API_KEY no configurada')
    this.apiKey = key
  }

  async execute(task: string, dryRun = false): Promise<AgentResult> {
    const actions: AgentAction[] = []

    // Plan the task
    const { plan, taskType } = await planTask(task, this.companyId, this.apiKey)

    if (dryRun) {
      return {
        plan,
        actions: [],
        summary: `Plan generado para: "${task}". Revisá los pasos antes de ejecutar.`,
        ai_provider: 'gemini',
      }
    }

    // Execute based on task type
    try {
      switch (taskType) {
        case 'cobranza':
          await executeCobranza(this.companyId, this.apiKey, actions)
          break
        case 'leads_followup':
          await executeLeadsFollowup(this.companyId, this.apiKey, actions)
          break
        case 'cierre_mes':
          await executeCierreMes(this.companyId, actions)
          break
        default: {
          // Generic: try to interpret and run basic actions
          const genericAlert = await createAlert(
            `Tarea agente: ${task.slice(0, 80)}`,
            `El agente procesó la tarea: "${task}"\n\nPlan:\n${plan.map((p, i) => `${i + 1}. ${p}`).join('\n')}`,
            'info',
            this.companyId
          )
          actions.push({
            tool: 'createAlert',
            params: { task },
            result: `Alerta creada (ID: ${genericAlert})`,
            status: 'success',
          })
          break
        }
      }
    } catch (e) {
      actions.push({
        tool: 'executeTask',
        params: { taskType },
        error: (e as Error).message,
        status: 'failed',
      })
    }

    const successCount = actions.filter((a) => a.status === 'success').length
    const failCount = actions.filter((a) => a.status === 'failed').length

    const summary = `Tarea completada: "${task}". ${successCount} acciones exitosas${failCount > 0 ? `, ${failCount} con errores` : ''}.`

    return {
      plan,
      actions,
      summary,
      ai_provider: 'gemini',
    }
  }
}
