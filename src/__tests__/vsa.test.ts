import { describe, it, expect } from 'vitest'
import type { Candle } from '@/types/market'
import type { Pivot } from '@/domain/elliott/types'
import { percentileRank, closeLocationValue, vsaTurnConfirms } from '@/domain/elliott/vsa'

function mkCandle(p: { high: number; low: number; close: number; volume: number }, index = 0): Candle {
  return {
    timestamp: index * 60_000,
    open: (p.high + p.low) / 2,
    high: p.high,
    low: p.low,
    close: p.close,
    volume: p.volume,
    closed: true,
  }
}

/** `n` velas tranquilas idénticas (rango 99–101, CLV 0.5, volumen bajo). */
function baseline(n: number, volume = 100): Candle[] {
  return Array.from({ length: n }, (_, i) => mkCandle({ high: 101, low: 99, close: 100, volume }, i))
}

function mkPivotAt(index: number, type: 'high' | 'low', flag?: Pivot['flag']): Pivot {
  return { index, timestamp: index * 60_000, price: 100, type, confirmed: true, flag }
}

describe('percentileRank', () => {
  it('valor por encima de todos → 1, por debajo → 0', () => {
    expect(percentileRank([1, 2, 3, 4], 5)).toBe(1)
    expect(percentileRank([1, 2, 3, 4], 0)).toBe(0)
  })

  it('valor intermedio → fracción de elementos menores', () => {
    expect(percentileRank([1, 2, 3, 4], 2.5)).toBe(0.5) // 1,2 < 2.5 → 2/4
  })

  it('empates por mid-rank (medio empate)', () => {
    expect(percentileRank([1, 2, 2, 3], 2)).toBe(0.5) // lt=1, eq=2 → (1+1)/4
  })

  it('robusto a outliers: solo cuenta el ORDEN, no la magnitud', () => {
    // El 1e6 no infla nada; el rank de 4 sigue siendo 3 de 4 menores.
    expect(percentileRank([1, 2, 3, 1_000_000], 4)).toBe(0.75)
  })

  it('ventana vacía o sin finitos → 0.5 neutro (ni premia ni castiga)', () => {
    expect(percentileRank([], 5)).toBe(0.5)
    expect(percentileRank([NaN, NaN], 5)).toBe(0.5)
  })
})

describe('closeLocationValue', () => {
  it('cierre en máximos → 1, en mínimos → 0, en medio → 0.5', () => {
    expect(closeLocationValue(mkCandle({ high: 10, low: 0, close: 10, volume: 1 }))).toBe(1)
    expect(closeLocationValue(mkCandle({ high: 10, low: 0, close: 0, volume: 1 }))).toBe(0)
    expect(closeLocationValue(mkCandle({ high: 10, low: 0, close: 5, volume: 1 }))).toBe(0.5)
  })

  it('doji / sin rango → null (no inventa un 0.5)', () => {
    expect(closeLocationValue(mkCandle({ high: 5, low: 5, close: 5, volume: 1 }))).toBeNull()
  })
})

describe('vsaTurnConfirms', () => {
  it('techo: volumen alto + cierre rechazado (CLV bajo) → clímax/distribución confirmado', () => {
    const candles = [...baseline(20), mkCandle({ high: 110, low: 100, close: 101, volume: 1000 }, 20)]
    const r = vsaTurnConfirms(candles, mkPivotAt(20, 'high'))
    expect(r.met).toBe(true)
    expect(r.detail).toContain('cierre rechazado')
  })

  it('suelo: volumen alto + cierre fuerte (CLV alto) → absorción confirmada', () => {
    const candles = [...baseline(20), mkCandle({ high: 110, low: 100, close: 109, volume: 1000 }, 20)]
    const r = vsaTurnConfirms(candles, mkPivotAt(20, 'low'))
    expect(r.met).toBe(true)
  })

  it('esfuerzo sin resultado: volumen alto pero cierre en mitad del rango → NO confirma', () => {
    const candles = [...baseline(20), mkCandle({ high: 110, low: 100, close: 105, volume: 1000 }, 20)]
    expect(vsaTurnConfirms(candles, mkPivotAt(20, 'high')).met).toBe(false)
  })

  it('bajo volumen (percentil < 0.80) aunque el cierre rechace → NO confirma', () => {
    const candles = [...baseline(20), mkCandle({ high: 110, low: 100, close: 101, volume: 100 }, 20)]
    expect(vsaTurnConfirms(candles, mkPivotAt(20, 'high')).met).toBe(false)
  })

  it('colisión con wick_spike → met=false (no premia la geometría que el motor penaliza)', () => {
    const candles = [...baseline(20), mkCandle({ high: 110, low: 100, close: 101, volume: 1000 }, 20)]
    const r = vsaTurnConfirms(candles, mkPivotAt(20, 'high', 'wick_spike'))
    expect(r.met).toBe(false)
    expect(r.detail).toContain('mecha')
  })

  it('ventana incompleta (pivote antes de completar el lookback) → met=false', () => {
    const candles = [...baseline(25)]
    const r = vsaTurnConfirms(candles, mkPivotAt(5, 'high'))
    expect(r.met).toBe(false)
    expect(r.detail).toContain('insuficientes')
  })

  it('doji en el giro → met=false (lectura indefinida)', () => {
    const candles = [...baseline(20), mkCandle({ high: 100, low: 100, close: 100, volume: 1000 }, 20)]
    expect(vsaTurnConfirms(candles, mkPivotAt(20, 'high')).met).toBe(false)
  })

  it('pivote con index fuera de rango (≥ length) → met=false sin lanzar', () => {
    const candles = baseline(21)
    const r = vsaTurnConfirms(candles, mkPivotAt(21, 'high')) // index == length
    expect(r.met).toBe(false)
    expect(r.detail).toContain('fuera de rango')
  })

  it('sin look-ahead: las velas POSTERIORES al giro no cambian el resultado', () => {
    const turn = mkCandle({ high: 110, low: 100, close: 101, volume: 1000 }, 20)
    const a = [...baseline(20), turn, ...baseline(4)] // futuro tranquilo
    const b = [
      ...baseline(20),
      turn,
      mkCandle({ high: 200, low: 50, close: 60, volume: 99_999 }, 21), // futuro extremo
      ...baseline(3),
    ]
    const ra = vsaTurnConfirms(a, mkPivotAt(20, 'high'))
    const rb = vsaTurnConfirms(b, mkPivotAt(20, 'high'))
    expect(ra).toEqual(rb)
  })
})
