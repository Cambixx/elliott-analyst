import { describe, it, expect } from 'vitest'
import { detectScenarios, detectScenariosMultiDegree } from '@/domain/elliott/detector'
import { williamsFilter, zigzag } from '@/domain/elliott/zigzag'
import { candlesFromPath, mkPivot } from './helpers'
import type { Candle } from '@/types/market'

describe('williamsFilter', () => {
  it('mantiene la alternancia high/low tras filtrar', () => {
    const candles = candlesFromPath([100, 130, 110, 150, 125, 160])
    const filtered = williamsFilter(zigzag(candles, 1.8), candles)
    for (let i = 1; i < filtered.length; i++) {
      expect(filtered[i].type).not.toBe(filtered[i - 1].type)
    }
  })

  it('conserva el primer y el último pivote', () => {
    const candles = candlesFromPath([100, 130, 110, 150, 125, 160])
    const pivots = zigzag(candles, 1.8)
    const filtered = williamsFilter(pivots, candles)
    expect(filtered[0].index).toBe(pivots[0].index)
    expect(filtered[filtered.length - 1].index).toBe(pivots[pivots.length - 1].index)
  })

  it('preserva el pivote provisional (último) aunque colisione con un predecesor más extremo', () => {
    // Velas planas a 100 salvo un low en 90 en el índice 11 (hace no-extremo al low@10).
    const candles: Candle[] = Array.from({ length: 20 }, (_, i) => ({
      timestamp: i * 60_000,
      open: 100,
      high: 100,
      low: i === 11 ? 90 : 100,
      close: 100,
      volume: 1,
      closed: true,
    }))
    const pivots = [
      mkPivot(0, 100, 'low'),
      mkPivot(5, 130, 'high'),
      mkPivot(10, 95, 'low'), // se descarta (vecino en 11 baja a 90)
      mkPivot(15, 120, 'high', false), // provisional, MENOS extremo que high@5 (130)
    ]
    const filtered = williamsFilter(pivots, candles)
    const last = filtered[filtered.length - 1]
    expect(last.confirmed).toBe(false)
    expect(last.price).toBe(120) // el provisional sobrevive, no el high@5
  })

  it('descarta un micro-pivote no-extremo y recolapsa', () => {
    // Pivotes sintéticos con un "low" intermedio que NO es mínimo local estricto.
    const candles: Candle[] = Array.from({ length: 20 }, (_, i) => ({
      timestamp: i * 60_000,
      open: 100,
      high: 100,
      low: 90, // todos bajan a 90 → un low@95 no sería extremo estricto
      close: 100,
      volume: 1,
      closed: true,
    }))
    const pivots = [
      mkPivot(0, 120, 'high'),
      mkPivot(5, 95, 'low'), // no es mínimo (vecinos llegan a 90)
      mkPivot(10, 118, 'high'),
      mkPivot(15, 80, 'low', false),
    ]
    const filtered = williamsFilter(pivots, candles)
    // El low@95 se descarta; los dos high se colapsan en el más alto (120).
    expect(filtered.some((p) => p.price === 95)).toBe(false)
    for (let i = 1; i < filtered.length; i++) {
      expect(filtered[i].type).not.toBe(filtered[i - 1].type)
    }
  })
})

describe('detectScenariosMultiDegree', () => {
  it('devuelve escenarios bien formados y nunca peores que el grado base', () => {
    const candles = candlesFromPath([100, 130, 115, 165, 140, 180, 150, 170, 148], 5)
    const base = detectScenarios(candles, 2)
    const multi = detectScenariosMultiDegree(candles, [1.4, 2, 3.2])
    expect(multi.scenarios.length).toBeGreaterThan(0)
    for (const s of multi.scenarios) {
      expect(s.score).toBeGreaterThanOrEqual(0)
      expect(s.score).toBeLessThanOrEqual(100)
    }
    // El primario multi-grado puntúa al menos como el del grado base (mismo k incluido).
    if (base.scenarios[0]) {
      expect(multi.scenarios[0].score).toBeGreaterThanOrEqual(base.scenarios[0].score)
    }
  })

  it('kList vacío → sin escenarios', () => {
    expect(detectScenariosMultiDegree(candlesFromPath([100, 120, 110]), []).scenarios).toEqual([])
  })
})
