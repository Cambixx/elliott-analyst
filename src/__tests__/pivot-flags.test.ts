import { describe, it, expect } from 'vitest'
import { zigzag } from '@/domain/elliott/zigzag'
import type { Candle } from '@/types/market'

/** Vela normal con cuerpo modesto y volumen `vol`. */
function bar(t: number, o: number, c: number, vol = 100): Candle {
  return {
    timestamp: t * 60_000,
    open: o,
    high: Math.max(o, c),
    low: Math.min(o, c),
    close: c,
    volume: vol,
    closed: true,
  }
}

describe('flags causales de pivote (zigzag)', () => {
  it('marca wick_spike en un pivote formado por una mecha desproporcionada', () => {
    // Tendencia tranquila al alza con cuerpos pequeños (ATR bajo)…
    const candles: Candle[] = []
    for (let i = 0; i < 30; i++) candles.push(bar(i, 100 + i * 0.5, 100 + i * 0.5 + 0.3))
    // …y una vela con mecha SUPERIOR enorme que crea un máximo y revierte.
    const t = 30
    const base = 100 + 30 * 0.5
    candles.push({
      timestamp: t * 60_000,
      open: base,
      high: base + 30, // mecha gigante (>> ATR)
      low: base - 0.5,
      close: base - 0.2, // revierte: cierra abajo
      volume: 100,
      closed: true,
    })
    // Caída posterior que confirma el pivote alto.
    for (let i = 31; i < 45; i++) candles.push(bar(i, base - (i - 30), base - (i - 30) - 0.3))

    const pivots = zigzag(candles, 2)
    const spike = pivots.find((p) => p.flag === 'wick_spike')
    expect(spike).toBeDefined()
  })

  it('marca low_liquidity en un pivote con volumen muy por debajo de la mediana', () => {
    const candles: Candle[] = []
    for (let i = 0; i < 20; i++) candles.push(bar(i, 100 - i, 100 - i - 0.5, 100)) // bajada, vol 100
    // Mínimo con volumen ínfimo (<40% de la mediana reciente).
    const t = 20
    const lowPrice = 100 - 20
    candles.push(bar(t, lowPrice, lowPrice - 2, 5)) // vol 5
    for (let i = 21; i < 35; i++) candles.push(bar(i, lowPrice + (i - 20), lowPrice + (i - 20) + 0.5, 100))

    const pivots = zigzag(candles, 2)
    const lowLiq = pivots.find((p) => p.flag === 'low_liquidity')
    expect(lowLiq).toBeDefined()
  })

  it('serie limpia → ningún pivote marcado', () => {
    const candles: Candle[] = []
    for (let i = 0; i < 20; i++) candles.push(bar(i, 100 + i, 100 + i + 0.5))
    for (let i = 20; i < 40; i++) candles.push(bar(i, 120 - (i - 20), 120 - (i - 20) - 0.5))
    const pivots = zigzag(candles, 2)
    expect(pivots.every((p) => !p.flag)).toBe(true)
  })
})
