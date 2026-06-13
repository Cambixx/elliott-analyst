import { describe, it, expect } from 'vitest'
import { zigzag } from '@/domain/elliott/zigzag'
import { candlesFromPath } from './helpers'

describe('zigzag', () => {
  it('alterna tipos high/low y no produce índices duplicados', () => {
    const candles = candlesFromPath([100, 130, 110, 150, 125, 160])
    const pivots = zigzag(candles, 1.8)
    expect(pivots.length).toBeGreaterThanOrEqual(4)
    for (let i = 1; i < pivots.length; i++) {
      expect(pivots[i].index).toBeGreaterThan(pivots[i - 1].index)
      expect(pivots[i].type).not.toBe(pivots[i - 1].type)
    }
  })

  it('mercado que arranca cayendo: sin pivote fantasma de longitud 0 en el índice 0', () => {
    // Antes del fix, la semilla low@0 chocaba con el primer high@0 (mismo índice,
    // mismo precio) y desplazaba las ventanas del detector.
    const candles = candlesFromPath([100, 70, 85, 55, 75, 40])
    const pivots = zigzag(candles, 1.8)
    const indexes = pivots.map((p) => p.index)
    expect(new Set(indexes).size).toBe(indexes.length)
    for (let i = 1; i < pivots.length; i++) {
      expect(pivots[i].type).not.toBe(pivots[i - 1].type)
    }
  })

  it('el último pivote de una tendencia en curso queda sin confirmar (anti-repaint)', () => {
    const candles = candlesFromPath([100, 120, 110, 145])
    const pivots = zigzag(candles, 1.8)
    expect(pivots[pivots.length - 1].confirmed).toBe(false)
  })

  it('series demasiado cortas devuelven lista vacía', () => {
    const candles = candlesFromPath([100, 101], 1)
    expect(zigzag(candles, 3)).toEqual([])
  })
})
