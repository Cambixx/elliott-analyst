import { describe, it, expect } from 'vitest'
import { computeFibZone } from '@/domain/elliott/fibZone'
import type { Candle } from '@/types/market'
import { mkPivot, mkScenario } from './helpers'

/** Velas planas en `price` con timestamps consecutivos. */
function flatCandles(n: number, price: number): Candle[] {
  return Array.from({ length: n }, (_, i) => ({
    timestamp: i * 60_000,
    open: price,
    high: price,
    low: price,
    close: price,
    volume: 100,
    closed: true,
  }))
}

/** Impulso alcista completado 100 → 200 que termina en el índice 50. */
function impulseUp() {
  return mkScenario({
    kind: 'impulse',
    pattern: 'impulso',
    direction: 'up',
    pivots: [
      mkPivot(0, 100, 'low'),
      mkPivot(10, 140, 'high'),
      mkPivot(20, 120, 'low'),
      mkPivot(30, 180, 'high'),
      mkPivot(40, 160, 'low'),
      mkPivot(50, 200, 'high'),
    ],
  })
}

describe('computeFibZone', () => {
  // range = 100 → niveles: 0.382→161.8, 0.5→150, 0.618→138.2, 0.786→121.4

  it('calcula los niveles de retroceso del impulso', () => {
    const zone = computeFibZone(impulseUp(), flatCandles(60, 190))
    expect(zone).not.toBeNull()
    const byRatio = Object.fromEntries(zone!.levels.map((l) => [l.ratio, l.price]))
    expect(byRatio[0.382]).toBeCloseTo(161.8)
    expect(byRatio[0.5]).toBeCloseTo(150)
    expect(byRatio[0.618]).toBeCloseTo(138.2)
    expect(byRatio[0.786]).toBeCloseTo(121.4)
    expect(zone!.bandLow).toBeCloseTo(138.2)
    expect(zone!.bandHigh).toBeCloseTo(161.8)
  })

  it('NO se marca rota por la mecha de la propia vela del pivote final', () => {
    const candles = flatCandles(60, 190)
    // La vela del pivote (índice 50) perfora el 0.786 con su mecha…
    candles[50] = { ...candles[50], low: 110 }
    // …pero las velas posteriores aguantan por encima.
    const zone = computeFibZone(impulseUp(), candles)
    expect(zone!.broken).toBe(false)
  })

  it('se marca rota si una vela POSTERIOR perfora el 0.786', () => {
    const candles = flatCandles(60, 190)
    candles[55] = { ...candles[55], low: 120 } // 120 < 121.4
    const zone = computeFibZone(impulseUp(), candles)
    expect(zone!.broken).toBe(true)
  })

  it('no aplica a escenarios en desarrollo ni a correcciones', () => {
    const developing = { ...impulseUp(), developing: true }
    expect(computeFibZone(developing, flatCandles(60, 190))).toBeNull()

    const correction = mkScenario({
      kind: 'correction',
      pattern: 'zigzag',
      direction: 'down',
      pivots: [mkPivot(0, 200, 'high'), mkPivot(10, 160, 'low'), mkPivot(20, 180, 'high'), mkPivot(30, 150, 'low')],
    })
    expect(computeFibZone(correction, flatCandles(40, 155))).toBeNull()
  })
})
