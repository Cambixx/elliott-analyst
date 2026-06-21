import type { Candle } from '@/types/market'

/**
 * On-Balance Volume (Granville), causal y alineado por índice de vela:
 * obv[0] = 0; obv[i] = obv[i-1] ± volume[i] según el signo del cambio de cierre.
 * Acumulado desde 0 (sin warmup NaN). Cada obv[i] depende solo de velas ≤ i → sin
 * look-ahead. Sin parámetros: la definición es fija.
 */
export function obv(candles: Candle[]): number[] {
  const out = new Array<number>(candles.length)
  if (candles.length === 0) return out
  out[0] = 0
  for (let i = 1; i < candles.length; i++) {
    const dc = candles[i].close - candles[i - 1].close
    const signed = dc > 0 ? candles[i].volume : dc < 0 ? -candles[i].volume : 0
    out[i] = out[i - 1] + signed
  }
  return out
}

/**
 * ¿El OBV NO confirma (no acompaña) la extensión de precio entre dos puntos del conteo?
 * En un impulso alcista, una divergencia de agotamiento sana en la onda 5 espera que el
 * OBV NO acompañe al nuevo máximo (delta OBV ≤ 0 entre el pivote previo y el extremo).
 * Espejo para bajista. Si falta el dato (NaN), devuelve `true`: degradación BENIGNA — se
 * comporta como si no hubiera OBV, de modo que NUNCA endurece más al factor que lo usa.
 */
export function obvNotConfirming(
  obvSeries: number[],
  priorIdx: number,
  extremeIdx: number,
  dir: 'up' | 'down',
): boolean {
  const a = obvSeries[priorIdx]
  const b = obvSeries[extremeIdx]
  if (!Number.isFinite(a) || !Number.isFinite(b)) return true
  const delta = b - a
  return dir === 'up' ? delta <= 0 : delta >= 0
}
