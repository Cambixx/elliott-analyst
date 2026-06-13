import { useQuery } from '@tanstack/react-query'
import { fetchFearGreed, fetchCoinMarket } from '@/api/market'

/** Índice Fear & Greed (global, se actualiza ~1 vez al día). */
export function useFearGreed() {
  return useQuery({
    queryKey: ['fear-greed'],
    queryFn: fetchFearGreed,
    staleTime: 10 * 60 * 1000,
    retry: 1,
  })
}

/** Market cap / cambio 24h del activo base (vía CoinGecko). */
export function useCoinMarket(base: string) {
  return useQuery({
    queryKey: ['coin-market', base],
    queryFn: () => fetchCoinMarket(base),
    staleTime: 5 * 60 * 1000,
    retry: 1,
  })
}
