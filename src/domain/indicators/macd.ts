import { ema } from './ema'

export interface Macd {
  line: number[]
  signal: number[]
  hist: number[]
}

/** MACD estándar (12, 26, 9). Arrays alineados al input (NaN en el warmup). */
export function macd(closes: number[], fast = 12, slow = 26, signalPeriod = 9): Macd {
  const ef = ema(closes, fast)
  const es = ema(closes, slow)
  const line = closes.map((_, i) =>
    Number.isFinite(ef[i]) && Number.isFinite(es[i]) ? ef[i] - es[i] : NaN,
  )

  const signal = new Array<number>(closes.length).fill(NaN)
  const startsAt = line.findIndex((v) => Number.isFinite(v))
  if (startsAt >= 0) {
    const sub = line.slice(startsAt)
    const se = ema(sub, signalPeriod)
    for (let i = 0; i < se.length; i++) signal[startsAt + i] = se[i]
  }

  const hist = line.map((v, i) =>
    Number.isFinite(v) && Number.isFinite(signal[i]) ? v - signal[i] : NaN,
  )
  return { line, signal, hist }
}
