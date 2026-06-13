import type { Candle } from '@/types/market'

/**
 * Average True Range (suavizado de Wilder). Devuelve un valor por vela.
 * Sirve como umbral adaptativo a la volatilidad para el ZigZag.
 */
export function computeATR(candles: Candle[], period = 14): number[] {
  const n = candles.length
  if (n === 0) return []

  const tr: number[] = new Array(n)
  tr[0] = candles[0].high - candles[0].low
  for (let i = 1; i < n; i++) {
    const h = candles[i].high
    const l = candles[i].low
    const prevClose = candles[i - 1].close
    tr[i] = Math.max(h - l, Math.abs(h - prevClose), Math.abs(l - prevClose))
  }

  const atr: number[] = new Array(n)
  let sum = 0
  for (let i = 0; i < n; i++) {
    if (i < period) {
      sum += tr[i]
      atr[i] = sum / (i + 1)
    } else {
      atr[i] = (atr[i - 1] * (period - 1) + tr[i]) / period
    }
  }
  return atr
}
