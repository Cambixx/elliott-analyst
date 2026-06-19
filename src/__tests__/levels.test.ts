import { describe, it, expect } from 'vitest'
import { supportResistance, classifyLevel, nearestLevel } from '@/domain/elliott/levels'
import { mkPivot } from './helpers'

describe('supportResistance', () => {
  it('agrupa pivotes cercanos en un nivel con sus toques', () => {
    // Tres toques cerca de 100 y dos cerca de 120.
    const pivots = [
      mkPivot(0, 100, 'high'),
      mkPivot(10, 100.3, 'low'),
      mkPivot(20, 99.8, 'high'),
      mkPivot(30, 120, 'low'),
      mkPivot(40, 120.4, 'high'),
    ]
    const levels = supportResistance(pivots, { tolerancePct: 0.006, minTouches: 2 })
    expect(levels.length).toBe(2)
    const strong = levels[0]
    expect(strong.touches).toBe(3) // el de ~100
    expect(strong.price).toBeCloseTo(100.03, 1)
  })

  it('descarta niveles con menos toques que el mínimo', () => {
    const pivots = [mkPivot(0, 100, 'high'), mkPivot(10, 130, 'low'), mkPivot(20, 160, 'high')]
    expect(supportResistance(pivots, { minTouches: 2 })).toEqual([])
  })

  it('ordena por fuerza (toques) y limita al máximo', () => {
    const pivots = [
      mkPivot(0, 100, 'high'),
      mkPivot(1, 100.2, 'low'),
      mkPivot(2, 100.1, 'high'), // nivel 100 ×3
      mkPivot(3, 200, 'low'),
      mkPivot(4, 200.3, 'high'), // nivel 200 ×2
    ]
    const levels = supportResistance(pivots, { minTouches: 2, max: 1 })
    expect(levels).toHaveLength(1)
    expect(levels[0].touches).toBe(3)
  })
})

describe('classifyLevel', () => {
  const lvl = { price: 110, touches: 3, lastIndex: 40 }
  it('por encima del precio = resistencia', () => {
    expect(classifyLevel(lvl, 100)).toBe('resistencia')
  })
  it('por debajo del precio = soporte', () => {
    expect(classifyLevel({ ...lvl, price: 90 }, 100)).toBe('soporte')
  })
  it('dentro de la banda = en-precio', () => {
    expect(classifyLevel({ ...lvl, price: 100.2 }, 100)).toBe('en-precio')
  })
})

describe('nearestLevel', () => {
  const levels = [
    { price: 100, touches: 3, lastIndex: 10 },
    { price: 120, touches: 2, lastIndex: 20 },
  ]
  it('encuentra el nivel dentro de la tolerancia', () => {
    expect(nearestLevel(100.3, levels, 0.006)?.price).toBe(100)
  })
  it('null si ninguno está cerca', () => {
    expect(nearestLevel(110, levels, 0.006)).toBeNull()
  })
})
