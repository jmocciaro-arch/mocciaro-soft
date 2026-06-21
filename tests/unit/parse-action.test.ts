import { describe, it, expect } from 'vitest'
import { extractProposedAction } from '@/lib/assistant/parse-action'

describe('extractProposedAction', () => {
  it('texto sin acción → action null, reply intacto', () => {
    const r = extractProposedAction('Tengo PH2 en 25, 50 y 70mm. ¿Cuál querés?')
    expect(r.action).toBeNull()
    expect(r.reply).toContain('PH2')
  })

  it('extrae el bloque ```action y limpia el reply', () => {
    const raw = 'Listo, te armo la cotización.\n```action\n{"type":"crear_borrador_cotizacion","client_hint":"Mirgor","currency":"EUR","items":[{"sku":"SP.VPPH2/50","description":"Punta Phillips PH2 50mm","quantity":5}]}\n```'
    const r = extractProposedAction(raw)
    expect(r.action).not.toBeNull()
    expect(r.action?.type).toBe('crear_borrador_cotizacion')
    expect(r.action?.client_hint).toBe('Mirgor')
    expect(r.action?.items[0].sku).toBe('SP.VPPH2/50')
    expect(r.action?.items[0].discount_pct).toBe(0)
    expect(r.reply).toBe('Listo, te armo la cotización.')
    expect(r.reply).not.toContain('```')
  })

  it('parsea un objeto JSON suelto con el tipo de acción', () => {
    const raw = '{"type":"crear_borrador_cotizacion","currency":"USD","items":[{"description":"Item X","quantity":2}]}'
    const r = extractProposedAction(raw)
    expect(r.action?.currency).toBe('USD')
    expect(r.action?.items).toHaveLength(1)
  })

  it('repara comas finales en el JSON', () => {
    const raw = '```action\n{"type":"crear_borrador_cotizacion","currency":"EUR","items":[{"description":"X","quantity":1,},],}\n```'
    const r = extractProposedAction(raw)
    expect(r.action).not.toBeNull()
  })

  it('JSON inválido → action null sin tirar, reply intacto', () => {
    const raw = 'Algo salió raro ```action\n{"type":"crear_borrador_cotizacion" items rotos`'
    const r = extractProposedAction(raw)
    expect(r.action).toBeNull()
    expect(r.reply).toContain('Algo salió raro')
  })

  it('acción sin items → no valida, action null', () => {
    const raw = '```action\n{"type":"crear_borrador_cotizacion","currency":"EUR","items":[]}\n```'
    const r = extractProposedAction(raw)
    expect(r.action).toBeNull()
  })
})
