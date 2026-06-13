import { useQuery } from '@tanstack/react-query'
import { fetchKlines } from '@/api/binance'
import type { Timeframe } from '@/types/market'

/** Carga las velas históricas del par/temporalidad seleccionados. */
export function useKlines(symbol: string, interval: Timeframe) {
  return useQuery({
    queryKey: ['klines', symbol, interval],
    queryFn: () => fetchKlines(symbol, interval, 1000),
  })
}
