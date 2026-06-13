export type Freshness = 'fresh' | 'lagging' | 'stale' | 'unknown'

/**
 * Clasifica la frescura del dato a partir de la edad de la última vela cerrada.
 * - fresh: ≤ 1 intervalo (la vela actual aún se está formando, es lo normal).
 * - lagging: ≤ 2 intervalos (puede que la pestaña haya estado dormida un rato).
 * - stale: > 2 intervalos (datos parados: WS caído / sin refresco).
 */
export function classifyFreshness(ageMs: number | null, stepMs: number): Freshness {
  if (ageMs == null || stepMs <= 0) return 'unknown'
  if (ageMs <= stepMs) return 'fresh'
  if (ageMs <= stepMs * 2) return 'lagging'
  return 'stale'
}
