import type { Candle } from '@/types/market'

/**
 * Aportación de flujo con SIGNO de una vela, en unidades de volumen base:
 *  - Si hay volumen de compra agresora (taker buy, k[9]): DELTA REAL = compras − ventas
 *    = 2·takerBuyVolume − volume. Mide quién ganó la barra de verdad (órdenes market),
 *    no el proxy de Granville.
 *  - Si falta el dato (velas sintéticas/cacheadas antiguas): fallback a Granville, que
 *    asigna TODO el volumen según el signo del cambio de cierre (necesita la vela previa).
 */
function signedFlow(c: Candle, prev: Candle | undefined): number {
  const tbv = c.takerBuyVolume
  if (tbv != null && Number.isFinite(tbv)) return 2 * tbv - c.volume
  if (!prev) return 0
  const dc = c.close - prev.close
  return dc > 0 ? c.volume : dc < 0 ? -c.volume : 0
}

/**
 * On-Balance Volume acumulado, causal y alineado por índice: obv[0]=0; obv[i]=obv[i-1]+
 * flujo con signo de la vela i (ver `signedFlow`). Con datos de Binance usa el DELTA REAL
 * de flujo agresor (compras−ventas); sin él, degrada al OBV clásico de Granville. Acumulado
 * desde 0 (sin warmup NaN); cada obv[i] depende solo de velas ≤ i → sin look-ahead.
 */
export function obv(candles: Candle[]): number[] {
  const out = new Array<number>(candles.length)
  if (candles.length === 0) return out
  out[0] = 0
  for (let i = 1; i < candles.length; i++) {
    out[i] = out[i - 1] + signedFlow(candles[i], candles[i - 1])
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
