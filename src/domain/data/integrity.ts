import type { Candle } from '@/types/market'

export interface IntegrityReport {
  /** true si no hay huecos, duplicados ni desorden temporal. */
  ok: boolean
  count: number
  /** Nº de velas que faltan (saltos temporales mayores que el paso esperado). */
  gaps: number
  /** Timestamps repetidos (paso 0). */
  duplicates: number
  /** Pasos temporales negativos (velas fuera de orden). */
  outOfOrder: number
  /** Paso temporal modal detectado (ms); 0 si no hay datos suficientes. */
  stepMs: number
}

/**
 * Comprueba la integridad temporal de una serie de velas SIN asumir el intervalo:
 * deriva el paso modal de los propios timestamps y cuenta huecos, duplicados y
 * desorden. Un hueco (p.ej. parada de mantenimiento del exchange) distorsiona el
 * ATR y la detección de pivotes en silencio, así que conviene detectarlo y avisar.
 */
export function checkCandleIntegrity(candles: Candle[]): IntegrityReport {
  const n = candles.length
  if (n < 3) return { ok: true, count: n, gaps: 0, duplicates: 0, outOfOrder: 0, stepMs: 0 }

  const diffs: number[] = []
  for (let i = 1; i < n; i++) diffs.push(candles[i].timestamp - candles[i - 1].timestamp)

  // Paso modal: el intervalo positivo más frecuente.
  const freq = new Map<number, number>()
  for (const d of diffs) if (d > 0) freq.set(d, (freq.get(d) ?? 0) + 1)
  let stepMs = 0
  let best = -1
  for (const [d, c] of freq) {
    if (c > best) {
      best = c
      stepMs = d
    }
  }

  let gaps = 0
  let duplicates = 0
  let outOfOrder = 0
  for (const d of diffs) {
    if (d === 0) duplicates++
    else if (d < 0) outOfOrder++
    else if (stepMs && d > stepMs * 1.5) gaps += Math.round(d / stepMs) - 1
  }

  return {
    ok: gaps === 0 && duplicates === 0 && outOfOrder === 0,
    count: n,
    gaps,
    duplicates,
    outOfOrder,
    stepMs,
  }
}
