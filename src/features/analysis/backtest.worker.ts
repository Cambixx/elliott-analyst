import { runBacktest, type BacktestOptions } from '@/domain/elliott/backtest'
import { calibrate } from '@/domain/elliott/calibration'
import type { Candle } from '@/types/market'

export interface BacktestRequest {
  candles: Candle[]
  sensitivity: number
  opts: BacktestOptions
}

/** Worker: corre el backtest (caro) fuera del hilo principal y devuelve resultado + calibración. */
self.onmessage = (e: MessageEvent<BacktestRequest>) => {
  const { candles, sensitivity, opts } = e.data
  const result = runBacktest(candles, sensitivity, opts)
  const calibration = calibrate(result.outcomes)
  self.postMessage({ result, calibration })
}
