import { NextRequest, NextResponse } from 'next/server'
import { getEnv } from '@/lib/env'

// POST /api/ai/transcribe
// FormData: file (audio/webm | audio/mp4), context? (string)
export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData()
    const file = formData.get('file') as File | null
    const context = (formData.get('context') as string | null) || 'SAT maintenance form'

    if (!file) {
      return NextResponse.json({ error: 'file requerido' }, { status: 400 })
    }

    const apiKey = getEnv('GEMINI_API_KEY')
    if (!apiKey) {
      return NextResponse.json({ error: 'GEMINI_API_KEY no configurada' }, { status: 500 })
    }

    // Convert file to base64
    const arrayBuffer = await file.arrayBuffer()
    const base64 = Buffer.from(arrayBuffer).toString('base64')
    const mimeType = file.type || 'audio/webm'

    const prompt = `Transcribí este audio y extraé datos de una ficha de mantenimiento SAT: técnico, motivo de ingreso, condición visual, observaciones.

Contexto: ${context}

Respondé en JSON con este formato exacto:
{
  "text": "transcripción completa del audio",
  "structured": {
    "tecnico": "nombre del técnico si se menciona o null",
    "motivo_ingreso": "motivo de ingreso si se menciona o null",
    "condicion_visual": "condición visual si se menciona o null",
    "observaciones": "observaciones técnicas si se mencionan o null"
  }
}

Si no podés extraer algún campo estructurado, dejalo como null.
Respondé SOLO con el JSON, sin texto adicional.`

    const geminiRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [
            {
              role: 'user',
              parts: [
                {
                  inline_data: {
                    mime_type: mimeType,
                    data: base64,
                  },
                },
                { text: prompt },
              ],
            },
          ],
          generationConfig: {
            maxOutputTokens: 1024,
            temperature: 0.1,
          },
        }),
      }
    )

    let rawContent = ''

    if (!geminiRes.ok) {
      console.log(`Gemini transcribe falló ${geminiRes.status}, intentando Claude...`)

      // Fallback: Claude sí soporta audio como document content block
      const anthropicKey = getEnv('ANTHROPIC_API_KEY')
      if (!anthropicKey) {
        return NextResponse.json({ error: 'Gemini agotó la cuota y no hay ANTHROPIC_API_KEY configurada' }, { status: 502 })
      }

      try {
        const claudeRes = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': anthropicKey,
            'anthropic-version': '2023-06-01',
          },
          body: JSON.stringify({
            model: 'claude-sonnet-4-20250514',
            max_tokens: 1024,
            system: 'Transcribí el audio y respondé en JSON con: {"text": "transcripción", "structured": {"tecnico": null, "motivo_ingreso": null, "condicion_visual": null, "observaciones": null}}. Solo JSON.',
            messages: [{
              role: 'user',
              content: [
                { type: 'document', source: { type: 'base64', media_type: mimeType, data: base64 } },
                { type: 'text', text: prompt },
              ],
            }],
          }),
        })

        if (claudeRes.ok) {
          const claudeData = await claudeRes.json()
          rawContent = claudeData.content?.[0]?.text || ''
        } else {
          return NextResponse.json({ error: `Ambas IAs fallaron. Gemini: cuota agotada. Claude: ${claudeRes.status}` }, { status: 502 })
        }
      } catch (claudeErr) {
        return NextResponse.json({ error: `Claude fallback error: ${(claudeErr as Error).message}` }, { status: 502 })
      }
    } else {
      const geminiData = await geminiRes.json()
      rawContent = geminiData.candidates?.[0]?.content?.parts?.[0]?.text || ''
    }

    // Parse JSON response
    let parsed: { text: string; structured?: Record<string, string | null> } = {
      text: rawContent,
      structured: {},
    }

    try {
      const jsonMatch = rawContent.match(/\{[\s\S]*\}/)
      if (jsonMatch) {
        parsed = JSON.parse(jsonMatch[0])
      }
    } catch {
      // If JSON parse fails, return raw text
      parsed = { text: rawContent, structured: {} }
    }

    return NextResponse.json({
      text: parsed.text || rawContent,
      structured: parsed.structured || {},
    })
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 })
  }
}
