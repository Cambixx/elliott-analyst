import { useMemo } from 'react'
import type { Candle, Timeframe } from '@/types/market'
import { checkCandleIntegrity, type IntegrityReport } from '@/domain/data/integrity'
import { classifyFreshness, type Freshness } from '@/domain/data/freshness'
import { TIMEFRAME_MS } from '@/domain/timeframe'

export interface DataQuality {
  integrity: IntegrityReport
  /** Antigüedad (ms) de la última vela CERRADA respecto a ahora. */
  lastClosedAgeMs: number | null
  /** Timestamp (ms) de cierre de la última vela cerrada. */
  lastClosedTimestamp: number | null
  /** Frescura cualitativa: fresco / con retraso / obsoleto. */
  freshness: Freshness
}

/**
 * Calidad de los datos sobre los que se calcula el análisis: integridad temporal
 * (huecos/duplicados) y frescura de la última vela cerrada. Refuerza la filosofía
 * de "no oráculo": el usuario sabe sobre qué calidad de dato se está calculando.
 *
 * `nowMs` se inyecta (del reloj del componente) para que el hook sea testeable y
 * se recalcule cuando el llamante lo refresque.
 */
export function useDataQuality(
  candles: Candle[] | undefined,
  interval: Timeframe,
  nowMs: number,
): DataQuality {
  return useMemo(() => {
    const closed = candles?.filter((c) => c.closed) ?? []
    // Integridad sobre las MISMAS velas cerradas que alimentan el análisis (coherencia).
    const integrity = checkCandleIntegrity(closed)
    const last = closed.at(-1)
    if (!last) {
      return {
        integrity,
        lastClosedAgeMs: null,
        lastClosedTimestamp: null,
        freshness: 'unknown',
      }
    }
    const step = TIMEFRAME_MS[interval]
    // La vela abre en `timestamp` y cierra ~`timestamp + step`. Edad = tiempo
    // transcurrido desde ese cierre. Una vela recién cerrada tiene edad ~0.
    const closeTime = last.timestamp + step
    const age = Math.max(0, nowMs - closeTime)
    return {
      integrity,
      lastClosedAgeMs: age,
      lastClosedTimestamp: closeTime,
      freshness: classifyFreshness(age, step),
    }
  }, [candles, interval, nowMs])
}
