import { describe, it, expect } from 'vitest'
import { detectScenarios } from '@/domain/elliott/detector'
import { scenarioBias } from '@/domain/elliott/opportunity'
import { candlesFromPath } from './helpers'

describe('detectScenarios (smoke sobre datos sintéticos)', () => {
  it('detecta un impulso alcista limpio y respeta las 3 reglas cardinales', () => {
    // 5 ondas al alza: 100→120 (1), →110 (2), →150 (3), →138 (4), →165 (5)
    const candles = candlesFromPath([100, 120, 110, 150, 138, 165, 158])
    const { scenarios } = detectScenarios(candles, 1.8)
    expect(scenarios.length).toBeGreaterThan(0)

    const impulse = scenarios.find((s) => s.kind === 'impulse' && s.direction === 'up')
    expect(impulse).toBeDefined()
    const v = impulse!.pivots.map((p) => p.price)
    // Regla 1: la onda 2 no retrocede más del 100% de la onda 1.
    expect(v[2]).toBeGreaterThan(v[0])
    // Regla 2: la onda 3 no es la más corta.
    const w1 = v[1] - v[0]
    const w3 = v[3] - v[2]
    const w5 = v[5] - v[4]
    expect(w3 >= w1 || w3 >= w5).toBe(true)
    // Regla 3: la onda 4 no solapa el territorio de la onda 1.
    expect(v[4]).toBeGreaterThan(v[1])
  })

  it('scores en [0,100], pivotes alternantes y sesgo definido en todos los escenarios', () => {
    const candles = candlesFromPath([100, 130, 115, 160, 140, 175, 150, 165, 145])
    const { scenarios } = detectScenarios(candles, 1.8)
    for (const s of scenarios) {
      expect(s.score).toBeGreaterThanOrEqual(0)
      expect(s.score).toBeLessThanOrEqual(100)
      expect(['compra', 'venta', 'vigilar']).toContain(scenarioBias(s))
      for (let i = 1; i < s.pivots.length; i++) {
        expect(s.pivots[i].type).not.toBe(s.pivots[i - 1].type)
        expect(s.pivots[i].index).toBeGreaterThan(s.pivots[i - 1].index)
      }
      expect(s.invalidation.price).toBeGreaterThan(0)
    }
  })

  it('zona objetivo del triángulo nunca es negativa', () => {
    // Oscilación contractiva alrededor de 10 con amplitud inicial enorme (90):
    // sin el clamp, low = E − amplitud sería negativo.
    const candles = candlesFromPath([100, 10, 80, 25, 65, 38, 55])
    const { scenarios } = detectScenarios(candles, 1.8)
    for (const s of scenarios) {
      if (s.target) {
        expect(s.target.low).toBeGreaterThanOrEqual(0)
      }
    }
  })

  it('sin datos suficientes → sin escenarios', () => {
    const candles = candlesFromPath([100, 101], 2)
    const { scenarios } = detectScenarios(candles, 3)
    expect(scenarios).toEqual([])
  })
})

/**
 * Regresión (hallazgo de auditoría): con la onda 5 en desarrollo ya EXTENDIDA
 * (superó 1.0×onda1), la zona objetivo quedaba por detrás del precio y la
 * proyección apuntaba hacia atrás. Tras el fix, la zona se escala por la
 * escalera de extensiones de Fibonacci hasta quedar por delante.
 */
describe('zona objetivo de la onda 5 en desarrollo', () => {
  it('onda 5 extendida → la zona se escala y queda por delante del último pivote', () => {
    // w1 = 20; la onda 5 en curso lleva 30 (> 1.0×w1 = 20) → escalera a [1, 1.618].
    const candles = candlesFromPath([100, 120, 108, 150, 135, 165])
    const { scenarios } = detectScenarios(candles, 3)
    const imp = scenarios.find((s) => s.pattern === 'impulso' && s.developing)
    expect(imp).toBeDefined()
    const lastPivot = imp!.pivots[imp!.pivots.length - 1].price
    expect(imp!.target).toBeDefined()
    expect(imp!.target!.high).toBeGreaterThan(lastPivot)
    expect(imp!.warnings.some((w) => w.includes('extendida'))).toBe(true)
  })

  it('onda 5 no extendida → zona estándar 0.618–1.0 × onda 1, sin aviso', () => {
    // w1 = 20; la onda 5 lleva 10 (< 0.618×w1 = 12.36) → zona estándar [147.36, 155].
    const candles = candlesFromPath([100, 120, 108, 150, 135, 145])
    const { scenarios } = detectScenarios(candles, 3)
    const imp = scenarios.find((s) => s.pattern === 'impulso' && s.developing)
    expect(imp).toBeDefined()
    expect(imp!.target!.low).toBeCloseTo(135 + 0.618 * 20, 1)
    expect(imp!.target!.high).toBeCloseTo(135 + 20, 1)
    expect(imp!.warnings.some((w) => w.includes('extendida'))).toBe(false)
  })

  it('desplome bajista en desarrollo: la zona objetivo nunca es negativa', () => {
    // Onda 1 enorme (100→45): sin clamp, p4 − w1 saldría negativo.
    const candles = candlesFromPath([100, 45, 75, 25, 40, 30])
    const { scenarios } = detectScenarios(candles, 1.8)
    for (const s of scenarios) {
      if (s.target) {
        expect(s.target.low).toBeGreaterThanOrEqual(0)
        expect(s.target.high).toBeGreaterThan(0)
      }
    }
  })
})

/**
 * Regresión (hallazgo de auditoría): en una plana EXPANDIDA la onda B supera el
 * origen por construcción, así que "superar el origen" no puede ser la
 * invalidación: debe situarse en el extremo de la onda B.
 */
describe('corrección ABC en desarrollo (continuación de la onda C)', () => {
  it('lleva zona objetivo de C e invalidación en el extremo de la onda B (no el origen)', () => {
    // Zigzag bajista con la onda C aún formándose (sin vela posterior que confirme).
    const candles = candlesFromPath([100, 80, 90, 70], 6)
    const { scenarios } = detectScenarios(candles, 1.6)
    const abc = scenarios.find((s) => s.pattern === 'zigzag' && s.developing)
    expect(abc).toBeDefined()
    expect(abc!.target).toBeDefined() // zona objetivo de C (continuación)
    // Invalidación = extremo de la onda B (p[2] ≈ 90), no el origen (100).
    expect(abc!.invalidation.price).toBeCloseTo(90, 0)
    expect(abc!.invalidation.reason).toContain('onda B')
  })
})

describe('plana expandida', () => {
  it('la invalidación se sitúa en el extremo de B, no en el origen ya superado', () => {
    // A: 100→80 (20 abajo) · B: 80→103 (bRet = 1.15, expandida) · C: 103→85.
    const candles = candlesFromPath([100, 80, 103, 85])
    const { scenarios } = detectScenarios(candles, 1.8)
    const flat = scenarios.find((s) => s.pattern === 'flat')
    expect(flat).toBeDefined()
    expect(flat!.invalidation.price).toBeCloseTo(103, 5)
    expect(flat!.invalidation.reason).toContain('onda B')
  })
})
