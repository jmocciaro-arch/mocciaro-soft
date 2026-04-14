/**
 * AI SERVICE LAYER — Multi-provider (Claude + Gemini)
 *
 * Unified interface for calling AI providers from server-side code.
 * Used by API routes to execute AI-powered actions on the system.
 */

export type AIProvider = 'claude' | 'gemini'

export interface AIMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

export interface AIResponse {
  content: string
  provider: AIProvider
  tokens_used?: number
  error?: string
}

// =====================================================
// CLAUDE (Anthropic)
// =====================================================

async function callClaude(messages: AIMessage[], options?: { maxTokens?: number }): Promise<AIResponse> {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) return { content: '', provider: 'claude', error: 'ANTHROPIC_API_KEY not configured' }

  const systemMsg = messages.find(m => m.role === 'system')?.content || ''
  const userMessages = messages.filter(m => m.role !== 'system').map(m => ({
    role: m.role as 'user' | 'assistant',
    content: m.content,
  }))

  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: options?.maxTokens || 4096,
        system: systemMsg,
        messages: userMessages,
      }),
    })

    if (!res.ok) {
      const err = await res.text()
      return { content: '', provider: 'claude', error: `Claude API error ${res.status}: ${err}` }
    }

    const data = await res.json()
    const content = data.content?.[0]?.text || ''
    const tokens = (data.usage?.input_tokens || 0) + (data.usage?.output_tokens || 0)

    return { content, provider: 'claude', tokens_used: tokens }
  } catch (err) {
    return { content: '', provider: 'claude', error: `Claude fetch error: ${(err as Error).message}` }
  }
}

// =====================================================
// GEMINI (Google)
// =====================================================

async function callGemini(messages: AIMessage[], options?: { maxTokens?: number }): Promise<AIResponse> {
  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) return { content: '', provider: 'gemini', error: 'GEMINI_API_KEY not configured' }

  // Convert messages to Gemini format
  const systemMsg = messages.find(m => m.role === 'system')?.content || ''
  const contents = messages
    .filter(m => m.role !== 'system')
    .map(m => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: m.content }],
    }))

  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          system_instruction: systemMsg ? { parts: [{ text: systemMsg }] } : undefined,
          contents,
          generationConfig: {
            maxOutputTokens: options?.maxTokens || 4096,
            temperature: 0.2,
          },
        }),
      }
    )

    if (!res.ok) {
      const err = await res.text()
      return { content: '', provider: 'gemini', error: `Gemini API error ${res.status}: ${err}` }
    }

    const data = await res.json()
    const content = data.candidates?.[0]?.content?.parts?.[0]?.text || ''
    const tokens = data.usageMetadata?.totalTokenCount || 0

    return { content, provider: 'gemini', tokens_used: tokens }
  } catch (err) {
    return { content: '', provider: 'gemini', error: `Gemini fetch error: ${(err as Error).message}` }
  }
}

// =====================================================
// UNIFIED INTERFACE
// =====================================================

export async function askAI(
  messages: AIMessage[],
  options?: { provider?: AIProvider; maxTokens?: number }
): Promise<AIResponse> {
  const provider = options?.provider || 'claude' // default to claude (more reliable)

  switch (provider) {
    case 'claude':
      return callClaude(messages, options)
    case 'gemini':
      return callGemini(messages, options)
    default:
      return { content: '', provider, error: `Unknown provider: ${provider}` }
  }
}

/**
 * Quick helper: ask AI a question with system context
 */
export async function aiQuery(
  systemPrompt: string,
  userPrompt: string,
  provider: AIProvider = 'gemini'
): Promise<string> {
  const response = await askAI(
    [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ],
    { provider }
  )
  if (response.error) throw new Error(response.error)
  return response.content
}
