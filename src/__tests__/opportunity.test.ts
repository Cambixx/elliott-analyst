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
 * Regresión (hallazgo de auditoría): la diagonal en desarrollo recibía sesgo
 * accionable (venta/compra) mientras un impulso idéntico en desarrollo recibía
 * 'vigilar'. Apostar a la reversión antes de completarse es prematuro.
 */
describe('scenarioBias con diagonales', () => {
  const base = {
    kind: 'impulse' as const,
    pattern: 'diagonal' as const,
    direction: 'up' as const,
    pivots: [mkPivot(0, 100, 'low'), mkPivot(10, 120, 'high')],
  }

  it('diagonal en desarrollo → vigilar (sin sesgo prematuro)', () => {
    expect(scenarioBias(mkScenario({ ...base, developing: true }))).toBe('vigilar')
  })

  it('diagonal completada → sesgo de reversión', () => {
    expect(scenarioBias(mkScenario({ ...base, developing: false }))).toBe('venta')
  })
})
