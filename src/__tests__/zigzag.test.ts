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

  it('mercado que cae desde la vela 0: el primer high toma candles[0].high, no su low', () => {
    // Regresión de auditoría: la búsqueda del primer máximo arrancaba en i=1 y sembraba el
    // extremo con candles[0].low, así que el high@0 salía mal-preciado (con el low).
    const candles = [
      { timestamp: 0, open: 108, high: 110, low: 100, close: 101, volume: 100, closed: true },
      { timestamp: 60_000, open: 101, high: 102, low: 95, close: 96, volume: 100, closed: true },
      { timestamp: 120_000, open: 96, high: 97, low: 90, close: 91, volume: 100, closed: true },
      { timestamp: 180_000, open: 91, high: 92, low: 84, close: 85, volume: 100, closed: true },
      { timestamp: 240_000, open: 85, high: 86, low: 78, close: 79, volume: 100, closed: true },
    ]
    const pivots = zigzag(candles, 1)
    const firstHigh = pivots.find((p) => p.type === 'high')
    expect(firstHigh).toBeDefined()
    expect(firstHigh!.price).toBe(110) // candles[0].high, no candles[0].low (100)
  })

  it('series demasiado cortas devuelven lista vacía', () => {
    const candles = candlesFromPath([100, 101], 1)
    expect(zigzag(candles, 3)).toEqual([])
  })
})
