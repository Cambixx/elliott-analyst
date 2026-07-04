import { describe, it, expect } from 'vitest'
import { buildPreTradeChecklist, type ChecklistInput } from '@/domain/checklist'

const base: ChecklistInput = {
  align: 'favor',
  confidence: 'alta',
  score: 80,
  vsaMet: true,
  derivs: 'refuerza',
  rr: 2.5,
}

describe('buildPreTradeChecklist', () => {
  it('5 flags en verde → Grado A', () => {
    const c = buildPreTradeChecklist(base)
    expect(c.grade).toBe('A')
    expect(c.flags).toHaveLength(5)
    expect(c.flags.every((f) => f.status === 'ok')).toBe(true)
  })

  it('un único rojo aislado baja A → B (no fuerza C)', () => {
    // 4 verdes + derivs en contra (1 rojo, no R:R).
    const c = buildPreTradeChecklist({ ...base, derivs: 'cautela' })
    expect(c.grade).toBe('B')
  })

  it('R:R en contra (<1) CAPA a C aunque el resto sea verde', () => {
    const c = buildPreTradeChecklist({ ...base, rr: 0.5 })
    expect(c.grade).toBe('C')
    expect(c.flags.find((f) => f.key === 'rr')!.status).toBe('against')
  })

  it('≥2 condiciones en contra → C', () => {
    const c = buildPreTradeChecklist({ ...base, align: 'contra', confidence: 'baja' })
    expect(c.grade).toBe('C')
  })

  it('condiciones mixtas (warns) → B', () => {
    const c = buildPreTradeChecklist({
      align: 'neutral',
      confidence: 'media',
      score: 55,
      vsaMet: true,
      derivs: 'neutral',
      rr: 2.2,
    })
    expect(c.grade).toBe('B')
  })

  it('derivs/vsa "na" no cuentan; A sigue alcanzable con 4 verdes sin perpetuo', () => {
    const c = buildPreTradeChecklist({ ...base, derivs: null, vsaMet: null })
    // align ok, confidence ok, rr ok = 3 verdes; vsa na, derivs na → solo 3 verdes → B.
    expect(c.grade).toBe('B')
    // Con VSA también verde: 4 verdes, 0 rojos, derivs na → A.
    expect(buildPreTradeChecklist({ ...base, derivs: null, vsaMet: true }).grade).toBe('A')
    expect(c.flags.find((f) => f.key === 'derivs')!.status).toBe('na')
    expect(c.flags.find((f) => f.key === 'vsa')!.status).toBe('na')
  })

  it('R:R null → against; sin objetivo válido en el detalle', () => {
    const c = buildPreTradeChecklist({ ...base, rr: null })
    const rr = c.flags.find((f) => f.key === 'rr')!
    expect(rr.status).toBe('against')
    expect(rr.detail).toContain('indefinido')
    expect(c.grade).toBe('C') // rrAgainst capa a C
  })

  it('el término de likelihood aparece en el detalle de confianza, sin %', () => {
    const c = buildPreTradeChecklist(base)
    const conf = c.flags.find((f) => f.key === 'confidence')!
    expect(conf.detail).toContain('Confianza alta')
    expect(conf.detail).not.toMatch(/%/)
  })
})
