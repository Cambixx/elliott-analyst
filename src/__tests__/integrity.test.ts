import { describe, it, expect } from 'vitest'
import { checkCandleIntegrity } from '@/domain/data/integrity'
import type { Candle } from '@/types/market'

const STEP = 3_600_000 // 1h

/** Serie de velas con timestamps a un paso fijo (1h), salvo overrides. */
function series(timestamps: number[]): Candle[] {
  return timestamps.map((t) => ({
    timestamp: t,
    open: 1,
    high: 1,
    low: 1,
    close: 1,
    volume: 1,
    closed: true,
  }))
}

describe('checkCandleIntegrity', () => {
  it('serie continua → ok, sin huecos, paso correcto', () => {
    const ts = Array.from({ length: 10 }, (_, i) => i * STEP)
    const r = checkCandleIntegrity(series(ts))
    expect(r.ok).toBe(true)
    expect(r.gaps).toBe(0)
    expect(r.stepMs).toBe(STEP)
  })

  it('detecta un hueco de 2 velas', () => {
    // …, 4h, [falta 5h, 6h], 7h, …
    const ts = [0, 1, 2, 3, 4, 7, 8, 9].map((h) => h * STEP)
    const r = checkCandleIntegrity(series(ts))
    expect(r.ok).toBe(false)
    expect(r.gaps).toBe(2)
  })

  it('detecta timestamps duplicados', () => {
    const ts = [0, 1, 2, 2, 3, 4].map((h) => h * STEP)
    const r = checkCandleIntegrity(series(ts))
    expect(r.duplicates).toBe(1)
    expect(r.ok).toBe(false)
  })

  it('detecta velas fuera de orden', () => {
    const ts = [0, 1, 3, 2, 4, 5].map((h) => h * STEP)
    const r = checkCandleIntegrity(series(ts))
    expect(r.outOfOrder).toBeGreaterThan(0)
    expect(r.ok).toBe(false)
  })

  it('series muy cortas se consideran ok (sin datos para juzgar)', () => {
    expect(checkCandleIntegrity(series([0, STEP])).ok).toBe(true)
  })
})
