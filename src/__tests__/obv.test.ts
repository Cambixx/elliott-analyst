import { describe, it, expect } from 'vitest'
import type { Candle } from '@/types/market'
import { obv, obvNotConfirming } from '@/domain/indicators/obv'

function mkCandle(close: number, volume: number): Candle {
  return { timestamp: 0, open: close, high: close, low: close, close, volume, closed: true }
}

describe('obv', () => {
  it('acumula con el signo del cambio de cierre, alineado por índice y empezando en 0', () => {
    const candles = [
      mkCandle(1, 10),
      mkCandle(2, 10), // sube → +10
      mkCandle(3, 10), // sube → +10
      mkCandle(2, 10), // baja → −10
    ]
    expect(obv(candles)).toEqual([0, 10, 20, 10])
  })

  it('cierres planos no mueven el OBV (delta 0)', () => {
    const candles = [mkCandle(5, 100), mkCandle(5, 100), mkCandle(5, 100)]
    expect(obv(candles)).toEqual([0, 0, 0])
  })

  it('es causal: cambiar una vela posterior no altera el OBV anterior', () => {
    const base = [mkCandle(1, 10), mkCandle(2, 10), mkCandle(3, 10)]
    const altered = [mkCandle(1, 10), mkCandle(2, 10), mkCandle(99, 999)]
    const a = obv(base)
    const b = obv(altered)
    expect(b.slice(0, 2)).toEqual(a.slice(0, 2)) // índices 0 y 1 idénticos
  })

  it('sin warmup NaN y longitud igual a la serie', () => {
    const out = obv([mkCandle(1, 10), mkCandle(2, 10)])
    expect(out).toHaveLength(2)
    for (const v of out) expect(Number.isFinite(v)).toBe(true)
  })

  it('serie vacía → array vacío', () => {
    expect(obv([])).toEqual([])
  })
})

describe('obvNotConfirming', () => {
  it('alcista: OBV que NO acompaña al nuevo máximo (delta ≤ 0) corrobora la divergencia', () => {
    const series = [0, 100, 50] // prior(1)=100, extremo(2)=50 → baja
    expect(obvNotConfirming(series, 1, 2, 'up')).toBe(true)
  })

  it('alcista: OBV que acompaña al precio (delta > 0) NO corrobora (divergencia débil)', () => {
    const series = [0, 100, 150]
    expect(obvNotConfirming(series, 1, 2, 'up')).toBe(false)
  })

  it('bajista: espejo — OBV que sube en un nuevo mínimo corrobora', () => {
    const series = [0, 100, 150] // delta > 0 → en bajista corrobora
    expect(obvNotConfirming(series, 1, 2, 'down')).toBe(true)
  })

  it('OBV ausente (NaN) → true (degradación benigna: no endurece el factor)', () => {
    expect(obvNotConfirming([0, NaN, 50], 1, 2, 'up')).toBe(true)
    expect(obvNotConfirming([0, 100, NaN], 1, 2, 'up')).toBe(true)
  })
})
