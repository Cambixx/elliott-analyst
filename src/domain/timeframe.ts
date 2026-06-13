import type { Timeframe } from '@/types/market'

/** Marco temporal inmediatamente superior usado para confirmar el conteo. */
export const HIGHER_TF: Record<Timeframe, string> = {
  '15m': '1h',
  '1h': '4h',
  '4h': '1d',
  '1d': '1w',
  '1w': '1M',
}

export function higherTimeframe(tf: Timeframe): string {
  return HIGHER_TF[tf]
}

/** Duración de cada temporalidad en milisegundos (para juzgar la frescura del dato). */
export const TIMEFRAME_MS: Record<Timeframe, number> = {
  '15m': 15 * 60_000,
  '1h': 60 * 60_000,
  '4h': 4 * 60 * 60_000,
  '1d': 24 * 60 * 60_000,
  '1w': 7 * 24 * 60 * 60_000,
}
