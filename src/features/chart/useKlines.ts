import { useQuery } from '@tanstack/react-query'
import { fetchKlines } from '@/api/binance'
import { TIMEFRAME_MS } from '@/domain/timeframe'
import type { Timeframe } from '@/types/market'

/**
 * Carga las velas históricas del par/temporalidad seleccionados y las REFRESCA
 * periódicamente, para que el análisis (Elliott/VWAP/forecast/Fibonacci) y la
 * comprobación de integridad no se queden congelados con los datos del primer
 * fetch. El intervalo se escala a la temporalidad (acotado 30s–5min): intradía
 * refresca varias veces por vela; marcos altos, como mucho cada 5 min.
 */
export function useKlines(symbol: string, interval: Timeframe) {
  const refetchInterval = Math.min(Math.max(TIMEFRAME_MS[interval] / 3, 30_000), 300_000)
  return useQuery({
    queryKey: ['klines', symbol, interval],
    queryFn: () => fetchKlines(symbol, interval, 1000),
    refetchInterval,
  })
}
