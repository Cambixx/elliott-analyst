import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { fetchKlines } from '@/api/binance'
import { higherTimeframe } from '@/domain/timeframe'
import { trendBias, type Bias } from '@/domain/indicators/trend'
import { detectScenariosMultiDegree } from '@/domain/elliott/detector'
import { degreeList } from '@/domain/elliott/backtest'
import type { Timeframe } from '@/types/market'
import type { Direction, Scenario } from '@/domain/elliott/types'

export interface HigherContext {
  timeframe: string
  bias: Bias
  /** Escenario primario del marco superior (si lo hay). */
  scenario: Scenario | null
  isLoading: boolean
}

const biasDirection: Record<Bias, Direction | null> = {
  alcista: 'up',
  bajista: 'down',
  mixto: null,
}

/** Contexto del marco temporal superior para validar el conteo del marco actual. */
export function useHigherTimeframe(
  symbol: string,
  interval: Timeframe,
  sensitivity: number,
): HigherContext {
  const higher = higherTimeframe(interval)
  const { data, isLoading } = useQuery({
    queryKey: ['klines', symbol, higher],
    queryFn: () => fetchKlines(symbol, higher, 1000),
  })

  return useMemo(() => {
    // Solo velas cerradas (anti-repaint, igual que useElliott).
    const closed = data?.filter((c) => c.closed)
    // Con pocas velas (p.ej. 1M solo tiene ~86) seguimos detectando estructura;
    // trendBias devolverá 'mixto' por debajo de 200 velas, que es lo correcto.
    if (!closed || closed.length < 40) {
      return { timeframe: higher, bias: 'mixto', scenario: null, isLoading }
    }
    const bias = trendBias(closed)
    const { scenarios } = detectScenariosMultiDegree(closed, degreeList(sensitivity))
    return { timeframe: higher, bias, scenario: scenarios[0] ?? null, isLoading }
  }, [data, higher, sensitivity, isLoading])
}

/** ¿La dirección de un escenario va a favor del sesgo del marco superior? */
export function alignmentWithBias(
  direction: Direction,
  bias: Bias,
): 'favor' | 'contra' | 'neutral' {
  const biasDir = biasDirection[bias]
  if (!biasDir) return 'neutral'
  return direction === biasDir ? 'favor' : 'contra'
}
