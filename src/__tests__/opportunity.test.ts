import { describe, it, expect } from 'vitest'
import { detectScenarios } from '@/domain/elliott/detector'
import { deriveOpportunity, scenarioBias } from '@/domain/elliott/opportunity'
import { candlesFromPath, mkPivot, mkScenario } from './helpers'

/**
 * Regresión (hallazgo de auditoría): el objetivo del triángulo (±amplitud)
 * contiene la propia estructura, así que "precio en zona objetivo" se cumplía
 * SIEMPRE, incluso sin ruptura → alertas espurias con razón engañosa.
 * Tras el fix, la zona de decisión del triángulo es la RUPTURA.
 */
describe('deriveOpportunity con triángulos', () => {
  // Triángulo contractivo 100→120→104→116→106→114, precio final ~112 (dentro).
  const candles = candlesFromPath([100, 120, 104, 116, 106, 114, 112], 6)
  const { scenarios } = detectScenarios(candles, 3)
  const tri = scenarios.find((s) => s.pattern === 'triangulo')

  it('el detector encuentra el triángulo de referencia', () => {
    expect(tri).toBeDefined()
  })

  it('precio DENTRO del triángulo: la razón nunca menciona la ruptura', () => {
    if (!tri) return
    const inside = 112
    for (const level of ['estricto', 'equilibrado', 'amplio'] as const) {
      const opp = deriveOpportunity(tri, inside, level)
      if (opp) {
        expect(opp.reason).not.toContain('ruptura')
        expect(opp.reason).not.toContain('objetivo tras ruptura')
      }
    }
  })

  it('precio FUERA del rango del triángulo (ruptura): sí cuenta como zona de decisión', () => {
    if (!tri) return
    const breakout = Math.max(...tri.pivots.map((p) => p.price)) * 1.03
    const opp = deriveOpportunity(tri, breakout, 'amplio')
    expect(opp).not.toBeNull()
    expect(opp!.reason).toContain('ruptura del triángulo')
  })
})

/**
 * Sesgo según fase: en DESARROLLO se opera la CONTINUACIÓN hacia el objetivo (en el
 * sentido de la onda); COMPLETADO se opera el giro/reanudación (sentido contrario).
 */
describe('scenarioBias por fase (desarrollo vs completado)', () => {
  const base = {
    kind: 'impulse' as const,
    pattern: 'diagonal' as const,
    direction: 'up' as const,
    pivots: [mkPivot(0, 100, 'low'), mkPivot(10, 120, 'high')],
  }

  it('en desarrollo (alcista) → compra (continuación hacia el objetivo)', () => {
    expect(scenarioBias(mkScenario({ ...base, developing: true }))).toBe('compra')
  })

  it('completada (alcista) → venta (reversión tras completarse)', () => {
    expect(scenarioBias(mkScenario({ ...base, developing: false }))).toBe('venta')
  })

  it('impulso en desarrollo bajista → venta (continuación a la baja)', () => {
    const imp = {
      kind: 'impulse' as const,
      pattern: 'impulso' as const,
      direction: 'down' as const,
      developing: true,
      pivots: [mkPivot(0, 120, 'high'), mkPivot(10, 100, 'low')],
    }
    expect(scenarioBias(mkScenario(imp))).toBe('venta')
  })

  it('corrección ABC en desarrollo bajista → venta (continuación de la corrección)', () => {
    const abc = {
      kind: 'correction' as const,
      pattern: 'zigzag' as const,
      direction: 'down' as const,
      developing: true,
      pivots: [mkPivot(0, 120, 'high'), mkPivot(10, 100, 'low'), mkPivot(20, 110, 'high'), mkPivot(30, 95, 'low', false)],
    }
    expect(scenarioBias(mkScenario(abc))).toBe('venta')
  })

  it('triángulo siempre → vigilar (en desarrollo o no)', () => {
    const tri = {
      kind: 'correction' as const,
      pattern: 'triangulo' as const,
      direction: 'up' as const,
      pivots: [mkPivot(0, 100, 'low'), mkPivot(10, 120, 'high')],
    }
    expect(scenarioBias(mkScenario({ ...tri, developing: true }))).toBe('vigilar')
    expect(scenarioBias(mkScenario({ ...tri, developing: false }))).toBe('vigilar')
  })
})
