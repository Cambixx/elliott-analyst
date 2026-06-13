import type { Candle } from '@/types/market'
import { ema } from './ema'
import { rsi } from './rsi'
import { macd, type Macd } from './macd'

export interface Indicators {
  rsi: number[]
  macd: Macd
  ema20: number[]
  ema50: number[]
  ema200: number[]
}

/** Calcula los indicadores que usa el score de confluencia, alineados por índice de vela. */
export function computeIndicators(candles: Candle[]): Indicators {
  // Guard de orden temporal (solo en desarrollo): los indicadores asumen velas en
  // orden ascendente estricto. La integridad ya se valida aparte; esto avisa pronto
  // si entran velas desordenadas, sin romper producción.
  if (import.meta.env.DEV) {
    for (let i = 1; i < candles.length; i++) {
      if (candles[i].timestamp <= candles[i - 1].timestamp) {
        console.warn(`computeIndicators: velas fuera de orden en el índice ${i}`)
        break
      }
    }
  }
  const close = candles.map((c) => c.close)
  return {
    rsi: rsi(close, 14),
    macd: macd(close),
    ema20: ema(close, 20),
    ema50: ema(close, 50),
    ema200: ema(close, 200),
  }
}

export type { Macd }
