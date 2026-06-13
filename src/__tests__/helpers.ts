import type { Candle } from '@/types/market'
import type { Pivot, Scenario } from '@/domain/elliott/types'

/**
 * Genera velas sintéticas interpolando linealmente entre waypoints de precio.
 * Cada tramo produce `perLeg` velas; deterministas y sin ruido.
 */
export function candlesFromPath(points: number[], perLeg = 8): Candle[] {
  const out: Candle[] = []
  let t = 0
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i]
    const b = points[i + 1]
    for (let j = 0; j < perLeg; j++) {
      const v = a + ((b - a) * j) / perLeg
      const next = a + ((b - a) * (j + 1)) / perLeg
      out.push({
        timestamp: t * 60_000,
        open: v,
        high: Math.max(v, next),
        low: Math.min(v, next),
        close: next,
        volume: 100,
        closed: true,
      })
      t++
    }
  }
  return out
}

export function mkPivot(
  index: number,
  price: number,
  type: 'high' | 'low',
  confirmed = true,
): Pivot {
  return { index, timestamp: index * 60_000, price, type, confirmed }
}

/** Escenario de prueba con valores por defecto razonables. */
export function mkScenario(
  over: Partial<Scenario> & Pick<Scenario, 'kind' | 'pattern' | 'direction' | 'pivots'>,
): Scenario {
  return {
    id: 'test',
    title: 'test',
    labels: [],
    score: 50,
    confidence: 'media',
    confluence: { score: 0, max: 0, factors: [] },
    developing: false,
    invalidation: { price: 0, reason: '' },
    narrative: '',
    warnings: [],
    ...over,
  }
}
