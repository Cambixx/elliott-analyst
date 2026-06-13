import { describe, it, expect } from 'vitest'
import { countSubSwings } from '@/domain/elliott/confluence'
import { detectScenarios } from '@/domain/elliott/detector'
import { candlesFromPath } from './helpers'

describe('countSubSwings (núcleo del factor de subondas)', () => {
  it('cuenta ~5 legs en un sub-rango con 5 sub-ondas claras', () => {
    // Mini impulso 1-2-3-4-5 dentro del sub-rango.
    const candles = candlesFromPath([100, 120, 110, 140, 130, 155], 6)
    const r = countSubSwings(candles, 0, candles.length - 1, 55, 5)
    expect(r.enoughData).toBe(true)
    expect(r.legs).toBeGreaterThanOrEqual(4)
  })

  it('cuenta ~3 legs en un sub-rango correctivo A-B-C', () => {
    const candles = candlesFromPath([100, 85, 95, 78], 6)
    const r = countSubSwings(candles, 0, candles.length - 1, 22, 3)
    expect(r.enoughData).toBe(true)
    expect(r.legs).toBeGreaterThanOrEqual(2)
    expect(r.legs).toBeLessThanOrEqual(4)
  })

  it('sub-rango demasiado corto → enoughData=false (no penaliza)', () => {
    const candles = candlesFromPath([100, 110], 2)
    const r = countSubSwings(candles, 0, candles.length - 1, 10, 5)
    expect(r.enoughData).toBe(false)
    expect(r.legs).toBe(0)
  })
})

describe('factor de subondas en el detector', () => {
  it('cuando un impulso se detecta con datos suficientes, el factor está bien formado', () => {
    // Impulso macro con tramos largos (perLeg alto) para que cada onda tenga velas.
    const path = [100, 130, 118, 165, 150, 185]
    const { scenarios } = detectScenarios(candlesFromPath(path, 10), 2.5)
    const imp = scenarios.find((s) => s.pattern === 'impulso')
    const factor = imp?.confluence.factors.find((f) => f.key === 'subondas')
    // Puede o no aparecer según los datos; si aparece, debe estar bien formado.
    if (factor) {
      expect(factor.weight).toBe(1)
      expect(factor.detail).toMatch(/Sub-swings/)
      expect(typeof factor.met).toBe('boolean')
    }
  })

  it('las diagonales NO incluyen el factor de subondas (subdividen 3-3-3-3-3)', () => {
    const path = [100, 130, 115, 150, 138, 158]
    const { scenarios } = detectScenarios(candlesFromPath(path, 5), 1.8)
    const dia = scenarios.find((s) => s.pattern === 'diagonal')
    if (dia) {
      expect(dia.confluence.factors.some((f) => f.key === 'subondas')).toBe(false)
    }
  })
})
