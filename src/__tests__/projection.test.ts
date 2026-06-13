import { describe, it, expect } from 'vitest'
import { projectionTargets } from '@/domain/elliott/projection'
import { mkPivot, mkScenario } from './helpers'

describe('projectionTargets', () => {
  it('escenario con zona objetivo → ambos bordes (triángulo: ruptura en ambas direcciones)', () => {
    const tri = mkScenario({
      kind: 'correction',
      pattern: 'triangulo',
      direction: 'up',
      target: { label: '±amplitud', low: 50, high: 150 },
      pivots: [mkPivot(0, 100, 'low'), mkPivot(10, 120, 'high')],
    })
    expect(projectionTargets(tri)).toEqual([150, 50])
  })

  it('filtra objetivos no positivos (thrust bajista acotado)', () => {
    const tri = mkScenario({
      kind: 'correction',
      pattern: 'triangulo',
      direction: 'up',
      target: { label: '±amplitud', low: 0, high: 60 },
      pivots: [mkPivot(0, 30, 'low'), mkPivot(10, 40, 'high')],
    })
    expect(projectionTargets(tri)).toEqual([60])
  })

  it('corrección sin zona → su origen (imán al reanudarse la tendencia)', () => {
    const abc = mkScenario({
      kind: 'correction',
      pattern: 'zigzag',
      direction: 'down',
      pivots: [mkPivot(0, 120, 'high'), mkPivot(10, 100, 'low'), mkPivot(20, 110, 'high'), mkPivot(30, 95, 'low')],
    })
    expect(projectionTargets(abc)).toEqual([120])
  })

  it('motriz sin zona → sin proyección', () => {
    const imp = mkScenario({
      kind: 'impulse',
      pattern: 'impulso',
      direction: 'up',
      pivots: [mkPivot(0, 100, 'low'), mkPivot(10, 130, 'high')],
    })
    expect(projectionTargets(imp)).toEqual([])
  })
})
