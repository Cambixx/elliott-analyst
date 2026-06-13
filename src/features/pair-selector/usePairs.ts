import { useQuery } from '@tanstack/react-query'
import { fetchUsdcPairs, FALLBACK_PAIRS } from '@/api/binance'

/** Lista de pares *USDC con status TRADING (cae a una lista curada si exchangeInfo falla). */
export function usePairs() {
  return useQuery({
    queryKey: ['usdc-pairs'],
    queryFn: fetchUsdcPairs,
    staleTime: 60 * 60 * 1000, // la lista de pares cambia poco
    placeholderData: FALLBACK_PAIRS,
  })
}
