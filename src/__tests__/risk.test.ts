import { describe, it, expect } from 'vitest'
import { computeRiskPlan } from '@/domain/risk'
import { mkPivot, mkScenario } from './helpers'

/** Impulso bajista completado → sesgo compra (largo). */
function bearishImpulseDone() {
  return mkScenario({
    kind: 'impulse',
    pattern: 'impulso',
    direction: 'down',
    invalidation: { price: 90, reason: '' },
    target: { label: 'Zona de corrección', low: 120, high: 140 },
    pivots: [
      mkPivot(0, 200, 'high'),
      mkPivot(10, 160, 'low'),
      mkPivot(20, 180, 'high'),
      mkPivot(30, 130, 'low'),
      mkPivot(40, 150, 'high'),
      mkPivot(50, 90, 'low'),
    ],
  })
}

describe('computeRiskPlan', () => {
  it('largo sobre impulso bajista completado: matemática exacta', () => {
    const plan = computeRiskPlan(bearishImpulseDone(), 100, 1000, 1)
    expect(plan).not.toBeNull()
    expect(plan!.bias).toBe('compra')
    expect(plan!.stop).toBe(90)
    expect(plan!.stopLabel).toBe('invalidación')
    expect(plan!.stopDistPct).toBeCloseTo(0.1)
    expect(plan!.riskAmount).toBe(10) // 1000 × 1%
    expect(plan!.positionNotional).toBeCloseTo(100) // 10 / 0.1
    expect(plan!.positionUnits).toBeCloseTo(1)
    expect(plan!.targetNear).toBe(120) // borde conservador (low en largo)
    expect(plan!.rr).toBeCloseTo(2) // (120−100) / (100−90)
    expect(plan!.leverage).toBeCloseTo(0.1)
  })

  it('corrección ABC bajista: stop = extremo de C, objetivo = origen', () => {
    const abc = mkScenario({
      kind: 'correction',
      pattern: 'zigzag',
      direction: 'down',
      // La invalidación del CONTEO es el origen (arriba): NO debe usarse como stop.
      invalidation: { price: 120, reason: '' },
      pivots: [
        mkPivot(0, 120, 'high'),
        mkPivot(10, 100, 'low'),
        mkPivot(20, 110, 'high'),
        mkPivot(30, 95, 'low'), // extremo de C
      ],
    })
    const plan = computeRiskPlan(abc, 100, 1000, 1)
    expect(plan).not.toBeNull()
    expect(plan!.bias).toBe('compra')
    expect(plan!.stop).toBe(95)
    expect(plan!.stopLabel).toBe('extremo de la corrección')
    expect(plan!.targetNear).toBe(120) // origen de la corrección
    expect(plan!.rr).toBeCloseTo(4) // 20 / 5
  })

  it('stop al lado equivocado de la entrada → null', () => {
    // Largo con el precio YA por debajo del stop.
    const plan = computeRiskPlan(bearishImpulseDone(), 85, 1000, 1)
    expect(plan).toBeNull()
  })

  it('escenario "vigilar" (triángulo) → null', () => {
    const tri = mkScenario({
      kind: 'correction',
      pattern: 'triangulo',
      direction: 'down',
      pivots: [mkPivot(0, 120, 'high'), mkPivot(10, 100, 'low'), mkPivot(20, 112, 'high'), mkPivot(30, 104, 'low'), mkPivot(40, 109, 'high'), mkPivot(50, 106, 'low')],
    })
    expect(computeRiskPlan(tri, 107, 1000, 1)).toBeNull()
  })

  it('stop muy ceñido → aviso de apalancamiento', () => {
    const s = bearishImpulseDone()
    s.invalidation = { price: 99.5, reason: '' } // 0.5% de distancia
    const plan = computeRiskPlan(s, 100, 1000, 1)
    expect(plan).not.toBeNull()
    expect(plan!.leverage).toBeGreaterThan(1)
    expect(plan!.warnings.some((w) => w.includes('apalancamiento'))).toBe(true)
  })

  it('entradas inválidas → null', () => {
    expect(computeRiskPlan(bearishImpulseDone(), 0, 1000, 1)).toBeNull()
    expect(computeRiskPlan(bearishImpulseDone(), 100, 0, 1)).toBeNull()
    expect(computeRiskPlan(bearishImpulseDone(), 100, 1000, 0)).toBeNull()
  })
})
