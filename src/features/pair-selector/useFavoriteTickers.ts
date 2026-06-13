import { useQuery } from '@tanstack/react-query'
import { fetchTickers } from '@/api/binance'

/** Precio + cambio 24h de los pares favoritos (refresco periódico). */
export function useFavoriteTickers(symbols: string[]) {
  return useQuery({
    queryKey: ['tickers', [...symbols].sort().join(',')],
    queryFn: () => fetchTickers(symbols),
    enabled: symbols.length > 0,
    refetchInterval: 15_000,
    staleTime: 10_000,
  })
}
