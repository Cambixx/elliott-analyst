import { useEffect, useState } from 'react'
import { subscribeKline } from '@/api/binance'
import type { Candle, Timeframe } from '@/types/market'

/**
 * Mantiene una conexión WebSocket a las velas en vivo del par/temporalidad
 * y expone la última vela recibida (cerrada o en curso).
 */
export function useLiveCandle(symbol: string, interval: Timeframe): Candle | null {
  const [candle, setCandle] = useState<Candle | null>(null)

  useEffect(() => {
    setCandle(null)
    const unsubscribe = subscribeKline(symbol, interval, setCandle)
    return unsubscribe
  }, [symbol, interval])

  return candle
}
