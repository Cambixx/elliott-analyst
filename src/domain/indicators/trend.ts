import type { Candle } from '@/types/market'
import { ema } from './ema'

export type Bias = 'alcista' | 'bajista' | 'mixto'

/**
 * Sesgo de tendencia por apilamiento de EMAs (50/200) y posición del precio.
 * Robusto y barato: sirve como "contexto" del marco superior para validar conteos.
 */
export function trendBias(candles: Candle[]): Bias {
  if (candles.length < 200) return 'mixto'
  const close = candles.map((c) => c.close)
  const e50 = ema(close, 50)
  const e200 = ema(close, 200)
  const i = candles.length - 1
  const price = close[i]
  const a = e50[i]
  const b = e200[i]
  if (!Number.isFinite(a) || !Number.isFinite(b)) return 'mixto'
  if (price > a && a > b) return 'alcista'
  if (price < a && a < b) return 'bajista'
  return 'mixto'
}
