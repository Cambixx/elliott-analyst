import { describe, it, expect } from 'vitest'
import { computeADX, atrPercentile, classifyRegime, computeRegime, regimeFactor } from '@/domain/indicators/adx'
import type { Candle } from '@/types/market'

function mkCandle(o: { high: number; low: number; close: number }, i: number): Candle {
  return { timestamp: i * 60_000, open: o.close, high: o.high, low: o.low, close: o.close, volume: 100, closed: true }
}

/** Tendencia alcista fuerte y limpia (cada vela nuevo máximo). */
function strongUptrend(n: number): Candle[] {
  return Array.from({ length: n }, (_, i) => mkCandle({ high: 100 + i * 2 + 1, low: 100 + i * 2 - 0.5, close: 100 + i * 2 }, i))
}

/** Mercado plano/lateral (rango estrecho, sin dirección). */
function flat(n: number): Candle[] {
  return Array.from({ length: n }, (_, i) => mkCandle({ high: 100.5, low: 99.5, close: 100 + (i % 2 === 0 ? 0.1 : -0.1) }, i))
}

describe('computeADX', () => {
  it('warmup NaN hasta 2·period−1 (=27) y valores finitos después', () => {
    const out = computeADX(strongUptrend(60))
    for (let i = 0; i < 27; i++) expect(Number.isNaN(out[i])).toBe(true)
    expect(Number.isFinite(out[27])).toBe(true)
    for (let i = 27; i < out.length; i++) expect(out[i]).toBeGreaterThanOrEqual(0)
  })

  it('tendencia fuerte → ADX alto (>25); mercado plano → ADX bajo (<20)', () => {
    expect(computeADX(strongUptrend(60)).at(-1)!).toBeGreaterThan(25)
    expect(computeADX(flat(60)).at(-1)!).toBeLessThan(20)
  })

  it('es causal: cambiar una vela posterior no altera un ADX anterior', () => {
    const base = strongUptrend(60)
    const altered = base.map((c, i) => (i >= 40 ? mkCandle({ high: 500, low: 480, close: 490 }, i) : c))
    expect(computeADX(altered)[35]).toBeCloseTo(computeADX(base)[35], 6)
  })
})

describe('atrPercentile', () => {
  it('devuelve NaN sin muestra suficiente y percentiles en [0,1] después', () => {
    const out = atrPercentile(strongUptrend(200))
    expect(Number.isNaN(out[10])).toBe(true) // warmup
    const last = out.at(-1)!
    expect(last).toBeGreaterThanOrEqual(0)
    expect(last).toBeLessThanOrEqual(1)
  })
})

describe('classifyRegime', () => {
  it('clasifica tendencia/rango/transición y compresión/expansión', () => {
    expect(classifyRegime(30, 0.9).trend).toBe('tendencia-fuerte')
    expect(classifyRegime(30, 0.9).vol).toBe('expansion')
    expect(classifyRegime(15, 0.1).trend).toBe('rango')
    expect(classifyRegime(15, 0.1).vol).toBe('compresion')
    expect(classifyRegime(22, 0.5).trend).toBe('transicion')
    expect(classifyRegime(22, 0.5).vol).toBe('normal')
  })

  it('datos no finitos → detalle "insuficientes"', () => {
    expect(classifyRegime(NaN, 0.5).detail).toContain('insuficientes')
  })
})

describe('regimeFactor', () => {
  it('met cuando hay baja tendencia (ADX<20) o compresión (ATR<p20)', () => {
    expect(regimeFactor(15, 0.5).met).toBe(true) // baja tendencia
    expect(regimeFactor(30, 0.1).met).toBe(true) // compresión
    expect(regimeFactor(30, 0.5).met).toBe(false) // tendencia fuerte, vol normal
  })

  it('readable=false en warmup (NaN) → el llamador lo omite, no lo cuenta como fallo', () => {
    expect(regimeFactor(NaN, 0.5).readable).toBe(false)
    expect(regimeFactor(30, NaN).readable).toBe(false)
    expect(regimeFactor(20, 0.5).readable).toBe(true)
  })
})

describe('computeRegime', () => {
  it('null si no hay datos suficientes; objeto si los hay', () => {
    expect(computeRegime([])).toBeNull()
    expect(computeRegime(strongUptrend(10))).toBeNull() // warmup
    expect(computeRegime(strongUptrend(200))).not.toBeNull()
  })
})
