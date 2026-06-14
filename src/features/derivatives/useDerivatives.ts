import { useQuery } from '@tanstack/react-query'
import { fetchDerivatives, fetchUsdtPerps, resolvePerp } from '@/api/binance-futures'

/** Conjunto de perpetuos USDT (exchangeInfo de futuros), cacheado 1h: cambia poco. */
function useUsdtPerps() {
  return useQuery({
    queryKey: ['futures-perps'],
    queryFn: fetchUsdtPerps,
    staleTime: 60 * 60 * 1000,
    retry: 1,
  })
}

/**
 * Funding rate + open interest del perpetuo USDT del activo base. Primero resuelve
 * el símbolo real del perpetuo (maneja la familia escalada 1000x de memecoins) y solo
 * entonces consulta los derivados. Funding se cobra cada 8h y el OI se mueve en
 * minutos, así que 2 min de caché va de sobra. Sin perpetuo → query desactivada → null.
 */
export function useDerivatives(base: string) {
  const { data: perps } = useUsdtPerps()
  const perp = perps ? resolvePerp(base, perps) : null
  return useQuery({
    queryKey: ['derivatives', perp],
    queryFn: () => fetchDerivatives(perp as string),
    enabled: !!perp,
    staleTime: 2 * 60 * 1000,
    retry: 1,
  })
}
