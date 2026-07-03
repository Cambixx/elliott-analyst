import { describe, it, expect } from 'vitest'
import { supportResistance, classifyLevel, nearestLevel, type SrLevel } from '@/domain/elliott/levels'
import { mkPivot } from './helpers'

describe('supportResistance', () => {
  it('agrupa pivotes cercanos en un nivel con sus toques y su zona real', () => {
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
    const strong = levels.find((l) => l.touches === 3)!
    expect(strong).toBeDefined()
    // Precio representativo = MEDIANA del cluster (robusta a mechas outlier).
    expect(strong.price).toBe(100)
    // La zona es la dispersión real de los toques del cluster.
    expect(strong.low).toBe(99.8)
    expect(strong.high).toBe(100.3)
  })

  it('enlace completo: no encadena toques hasta superar la tolerancia (anti-chaining)', () => {
    // Cuatro toques en escalera de ~0.4%: el codicioso antiguo unía 100..100.8 (0.8% de
    // anchura, MÁS que la tolerancia); el enlace completo produce dos zonas acotadas.
    const pivots = [
      mkPivot(0, 100, 'high'),
      mkPivot(10, 100.4, 'low'),
      mkPivot(20, 100.8, 'high'),
      mkPivot(30, 101.2, 'low'),
    ]
    const levels = supportResistance(pivots, { tolerancePct: 0.006, minTouches: 2 })
    expect(levels).toHaveLength(2)
    for (const l of levels) {
      expect(l.touches).toBe(2)
      expect((l.high - l.low) / l.price).toBeLessThanOrEqual(0.006)
    }
  })

  it('descarta niveles con menos toques que el mínimo', () => {
    const pivots = [mkPivot(0, 100, 'high'), mkPivot(10, 130, 'low'), mkPivot(20, 160, 'high')]
    expect(supportResistance(pivots, { minTouches: 2 })).toEqual([])
  })

  it('ordena por vigencia (toques con decaimiento por recencia) y limita al máximo', () => {
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

  it('un nivel muy tocado pero abandonado pesa menos que uno reciente', () => {
    // Nivel 100: 4 toques, el último hace 600 velas (decae 2^-4 = ×0.0625 → ~0.25).
    // Nivel 200: 2 toques, recién tocado (→ ~2). El reciente debe ir primero.
    const pivots = [
      mkPivot(0, 100, 'high'),
      mkPivot(2, 100.1, 'low'),
      mkPivot(4, 99.9, 'high'),
      mkPivot(6, 100.05, 'low'),
      mkPivot(590, 200, 'high'),
      mkPivot(600, 200.2, 'low'),
    ]
    const levels = supportResistance(pivots, { minTouches: 2, nowIndex: 606 })
    expect(levels[0].price).toBeCloseTo(200.1, 1)
    expect(levels[0].touches).toBe(2)
  })

  it('asigna fuerza ordinal por terciles del set devuelto', () => {
    const pivots = [
      mkPivot(100, 100, 'high'),
      mkPivot(101, 100.1, 'low'),
      mkPivot(102, 100.05, 'high'), // ×3, reciente → el más fuerte
      mkPivot(103, 150, 'low'),
      mkPivot(104, 150.2, 'high'), // ×2
      mkPivot(50, 200, 'low'),
      mkPivot(60, 200.3, 'high'), // ×2, más viejo → el más débil
    ]
    const levels = supportResistance(pivots, { minTouches: 2, nowIndex: 104 })
    expect(levels).toHaveLength(3)
    expect(levels[0].strength).toBe('fuerte')
    expect(levels[1].strength).toBe('moderada')
    expect(levels[2].strength).toBe('débil')
  })
})

const mkLevel = (over: Partial<SrLevel> & Pick<SrLevel, 'price' | 'low' | 'high'>): SrLevel => ({
  touches: 3,
  lastIndex: 40,
  strength: 'fuerte',
  ...over,
})

describe('classifyLevel', () => {
  it('zona por encima del precio = resistencia', () => {
    expect(classifyLevel(mkLevel({ price: 110, low: 109.5, high: 110.5 }), 100)).toBe('resistencia')
  })
  it('zona por debajo del precio = soporte', () => {
    expect(classifyLevel(mkLevel({ price: 90, low: 89.5, high: 90.5 }), 100)).toBe('soporte')
  })
  it('precio dentro de la ZONA real [low, high] = en-precio', () => {
    expect(classifyLevel(mkLevel({ price: 100.4, low: 99.9, high: 100.6 }), 100)).toBe('en-precio')
  })
  it('zona degenerada (toques idénticos): banda mínima bandPct alrededor del nivel', () => {
    expect(classifyLevel(mkLevel({ price: 100.2, low: 100.2, high: 100.2 }), 100)).toBe('en-precio')
  })
})

describe('nearestLevel', () => {
  const levels = [
    mkLevel({ price: 100, low: 99.7, high: 100.3, lastIndex: 10 }),
    mkLevel({ price: 120, low: 119.8, high: 120.2, touches: 2, lastIndex: 20 }),
  ]
  it('encuentra el nivel dentro de la tolerancia', () => {
    expect(nearestLevel(100.3, levels, 0.006)?.price).toBe(100)
  })
  it('null si ninguno está cerca', () => {
    expect(nearestLevel(110, levels, 0.006)).toBeNull()
  })
})
