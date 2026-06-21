import { describe, it, expect } from 'vitest'
import { evaluateImpulseConfluence, evaluateAbcConfluence } from '@/domain/elliott/confluence'
import { computeIndicators } from '@/domain/indicators'
import type { ConfluenceFactor } from '@/domain/elliott/types'
import { candlesFromPath, mkPivot } from './helpers'

const byKey = (factors: ConfluenceFactor[], key: string) => factors.find((f) => f.key === key)

describe('integración VSA en confluencia (impulso/diagonal)', () => {
  // Impulso alcista 0-1-2-3-4-5; perLeg=10 → pivotes en 0/9/19/29/39/49.
  const candles = candlesFromPath([100, 120, 110, 150, 140, 170], 10)
  const ind = computeIndicators(candles)
  const pivots = [
    mkPivot(0, 100, 'low'),
    mkPivot(9, 120, 'high'),
    mkPivot(19, 110, 'low'),
    mkPivot(29, 150, 'high'),
    mkPivot(39, 140, 'low'),
    mkPivot(49, 170, 'high'),
  ]
  const factors = evaluateImpulseConfluence(candles, ind, pivots, 'up')

  it("conserva la key 'vol' y su weight 1.2 (sin inflar) ahora como factor VSA", () => {
    const vol = byKey(factors, 'vol')
    expect(vol).toBeDefined()
    expect(vol!.weight).toBe(1.2)
    expect(vol!.label).toContain('VSA')
  })

  it("conserva la key 'div5' y su weight 1.5; ahora corroborada por volumen (OBV)", () => {
    const div5 = byKey(factors, 'div5')
    expect(div5).toBeDefined()
    expect(div5!.weight).toBe(1.5)
    expect(div5!.label.toLowerCase()).toContain('volumen')
  })

  it('no introduce factores de volumen ADICIONALES (sigue habiendo un solo "vol")', () => {
    expect(factors.filter((f) => f.key === 'vol')).toHaveLength(1)
  })
})

describe('integración VSA en confluencia (ABC/wxy)', () => {
  // Corrección bajista A-B-C; fin de C = p[3] (un mínimo).
  const candles = candlesFromPath([100, 80, 90, 70], 10)
  const ind = computeIndicators(candles)
  const pivots = [
    mkPivot(0, 100, 'high'),
    mkPivot(9, 80, 'low'),
    mkPivot(19, 90, 'high'),
    mkPivot(29, 70, 'low'),
  ]
  const factors = evaluateAbcConfluence(candles, ind, pivots, 'down')

  it("conserva la key 'volB' con weight por defecto (1) como factor VSA al final de C", () => {
    const volB = byKey(factors, 'volB')
    expect(volB).toBeDefined()
    expect(volB!.weight).toBeUndefined() // peso ausente → 1 (no se infla)
    expect(volB!.label).toContain('VSA')
  })
})
