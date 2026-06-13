import { useEffect, useState } from 'react'
import type { Candle } from '@/types/market'
import { runBacktest, type BacktestResult } from '@/domain/elliott/backtest'
import { calibrate, type Calibration } from '@/domain/elliott/calibration'

export interface BacktestInsight {
  result: BacktestResult
  calibration: Calibration
}

// maxEvaluations menor que antes: el backtest ahora corre multi-grado (3× detector
// por evaluación), así que se acota para mantener el coste razonable en el worker.
const OPTS = { horizon: 24, maxEvaluations: 120 }

/**
 * Backtest walk-forward del motor sobre el histórico del par/TF actual, calibrado.
 * Corre en un Web Worker para no bloquear el hilo principal (el backtest evalúa
 * el detector ~300 veces). Devuelve null hasta que el worker responde y al cambiar
 * par/TF/grado (el panel aparece cuando hay resultado). Fallback síncrono si el
 * entorno no soporta Workers.
 */
export function useBacktest(candles: Candle[] | undefined, sensitivity: number): BacktestInsight | null {
  const [insight, setInsight] = useState<BacktestInsight | null>(null)

  useEffect(() => {
    const closed = candles?.filter((c) => c.closed) ?? []
    if (closed.length < 120) {
      setInsight(null)
      return
    }

    const finish = (result: BacktestResult, calibration: Calibration) => {
      setInsight(result.resolved === 0 ? null : { result, calibration })
    }

    // Fallback síncrono (p.ej. entornos sin Worker).
    if (typeof Worker === 'undefined') {
      const result = runBacktest(closed, sensitivity, OPTS)
      finish(result, calibrate(result.outcomes))
      return
    }

    let cancelled = false
    const worker = new Worker(new URL('./backtest.worker.ts', import.meta.url), { type: 'module' })
    worker.onmessage = (e: MessageEvent<{ result: BacktestResult; calibration: Calibration }>) => {
      if (!cancelled) finish(e.data.result, e.data.calibration)
    }
    worker.onerror = () => {
      // Si el worker falla, se calcula en el hilo principal como respaldo.
      worker.terminate()
      if (cancelled) return
      const result = runBacktest(closed, sensitivity, OPTS)
      finish(result, calibrate(result.outcomes))
    }
    worker.postMessage({ candles: closed, sensitivity, opts: OPTS })
    return () => {
      cancelled = true
      worker.terminate()
    }
  }, [candles, sensitivity])

  return insight
}
