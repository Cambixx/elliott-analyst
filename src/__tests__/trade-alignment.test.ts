import { describe, it, expect } from 'vitest'
import { tradeAlignmentWithBias } from '@/features/analysis/useHigherTimeframe'
import { buildChecklistFor } from '@/features/analysis/preTrade'
import type { RiskPlan } from '@/domain/risk'
import { mkPivot, mkScenario } from './helpers'

const plan = (rr: number): RiskPlan => ({
  bias: 'compra',
  entry: 100,
  stop: 95,
  stopLabel: 'test',
  stopLevel: 95,
  stopBuffer: 0,
  stopBufferAtr: 0,
  targetNear: 115,
  targetFar: null,
  targetLabel: 'test',
  riskAmount: 10,
  stopDistPct: 0.05,
  positionNotional: 200,
  positionUnits: 2,
  rr: rr,
  leverage: 0.2,
  warnings: [],
})

/** Corrección bajista COMPLETADA → se opera al alza (reanudación). */
const zigzagBajistaCompletado = mkScenario({
  kind: 'correction',
  pattern: 'zigzag',
  direction: 'down',
  developing: false,
  pivots: [mkPivot(0, 100, 'high'), mkPivot(5, 90, 'low'), mkPivot(9, 96, 'high'), mkPivot(14, 86, 'low')],
})

/** Impulso alcista EN DESARROLLO → se opera al alza (continuación). */
const impulsoAlcistaEnCurso = mkScenario({
  kind: 'impulse',
  pattern: 'impulso',
  direction: 'up',
  developing: true,
  pivots: [mkPivot(0, 80, 'low'), mkPivot(3, 95, 'high'), mkPivot(5, 88, 'low'), mkPivot(9, 110, 'high'), mkPivot(12, 102, 'low'), mkPivot(16, 120, 'high')],
})

describe('tradeAlignmentWithBias', () => {
  it('un conteo COMPLETADO se alinea por el sentido del trade, no por su estructura', () => {
    // Corrección BAJISTA completada dentro de un marco superior ALCISTA: el trade es
    // LARGO, así que va A FAVOR. Comparando la dirección estructural (down vs alcista)
    // salía "contra" — ese era el bug: penalizaba el checklist justo al revés.
    expect(tradeAlignmentWithBias(zigzagBajistaCompletado, 'alcista')).toBe('favor')
    expect(tradeAlignmentWithBias(zigzagBajistaCompletado, 'bajista')).toBe('contra')
  })

  it('un conteo EN DESARROLLO se alinea con su propia dirección (continuación)', () => {
    expect(tradeAlignmentWithBias(impulsoAlcistaEnCurso, 'alcista')).toBe('favor')
    expect(tradeAlignmentWithBias(impulsoAlcistaEnCurso, 'bajista')).toBe('contra')
  })

  it('un marco superior mixto es neutral', () => {
    expect(tradeAlignmentWithBias(zigzagBajistaCompletado, 'mixto')).toBe('neutral')
  })

  it('un triángulo (sin sesgo accionable) es neutral en cualquier marco', () => {
    const triangulo = mkScenario({
      kind: 'correction',
      pattern: 'triangulo',
      direction: 'down',
      pivots: [mkPivot(0, 100, 'high'), mkPivot(4, 90, 'low')],
    })
    expect(tradeAlignmentWithBias(triangulo, 'alcista')).toBe('neutral')
    expect(tradeAlignmentWithBias(triangulo, 'bajista')).toBe('neutral')
  })
})

describe('buildChecklistFor', () => {
  it('no marca "en contra" una corrección completada que se opera A FAVOR del marco superior', () => {
    const cl = buildChecklistFor(zigzagBajistaCompletado, plan(2.5), 'alcista', null)
    const align = cl!.flags.find((f) => f.key === 'align')!
    expect(align.status).toBe('ok')
    expect(align.detail).toContain('A favor')
  })

  it('sin escenario o sin plan no inventa checklist', () => {
    expect(buildChecklistFor(null, plan(2), 'alcista', null)).toBeNull()
    expect(buildChecklistFor(zigzagBajistaCompletado, null, 'alcista', null)).toBeNull()
  })
})
