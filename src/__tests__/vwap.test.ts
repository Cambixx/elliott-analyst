import { describe, it, expect } from 'vitest'
import { anchoredVwap } from '@/domain/vwap'
import type { Candle } from '@/types/market'

function candle(price: number, vol: number): Candle {
  return { timestamp: price, open: price, high: price, low: price, close: price, volume: vol, closed: true }
}

describe('anchoredVwap', () => {
  it('VWAP de una vela = su precio típico', () => {
    const v = anchoredVwap([candle(100, 10)], 0)
    expect(v!.current).toBeCloseTo(100)
    expect(v!.points).toHaveLength(1)
  })

  it('pondera por volumen acumulado desde el ancla', () => {
    // tp 100 (vol 10) y tp 200 (vol 30) → (100·10 + 200·30)/(40) = 175.
    const v = anchoredVwap([candle(100, 10), candle(200, 30)], 0)
    expect(v!.current).toBeCloseTo(175)
  })

  it('respeta el ancla (ignora velas previas)', () => {
    const v = anchoredVwap([candle(50, 100), candle(100, 10), candle(200, 30)], 1)
    expect(v!.anchorIndex).toBe(1)
    expect(v!.points).toHaveLength(2)
    expect(v!.current).toBeCloseTo(175) // la vela @50 no entra
  })

  it('volumen cero → cae al precio típico sin dividir por cero', () => {
    const v = anchoredVwap([candle(100, 0), candle(120, 0)], 0)
    expect(v!.points[0].value).toBeCloseTo(100)
    expect(Number.isFinite(v!.current)).toBe(true)
  })

  it('ancla fuera de rango → null', () => {
    expect(anchoredVwap([candle(100, 10)], 5)).toBeNull()
    expect(anchoredVwap([], 0)).toBeNull()
  })
})
