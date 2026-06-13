import type { Candle } from '@/types/market'
import type { Scenario } from './types'

/**
 * Zona de retroceso de Fibonacci de un impulso completado, proyectada hacia
 * delante: dónde se espera que termine la corrección. La banda "dorada"
 * (0.382–0.618) es la de mejor relación riesgo/recompensa; si el precio retrocede
 * más allá del nivel profundo (0.786), la zona se marca como "rota".
 */
export interface FibZone {
  fromTs: number
  toTs: number
  levels: { ratio: number; price: number }[]
  bandLow: number
  bandHigh: number
  broken: boolean
  direction: 'up' | 'down'
}

const LEVELS = [0.382, 0.5, 0.618, 0.786] as const
const GOLDEN: [number, number] = [0.382, 0.618]
const DEEP = 0.786
const PROJECT_BARS = 14

export function computeFibZone(s: Scenario, candles: Candle[]): FibZone | null {
  // Solo para estructuras motrices (impulso/diagonal) ya completadas.
  if (s.kind !== 'impulse' || s.developing || candles.length < 2) return null

  const p0 = s.pivots[0]
  const pEnd = s.pivots[s.pivots.length - 1]
  const range = pEnd.price - p0.price // con signo: >0 alcista, <0 bajista
  if (range === 0) return null

  const at = (x: number) => pEnd.price - x * range // retroceso desde el final hacia el inicio
  const levels = LEVELS.map((r) => ({ ratio: r, price: at(r) }))
  const bandA = at(GOLDEN[0])
  const bandB = at(GOLDEN[1])
  const up = range > 0
  const deepPrice = at(DEEP)

  // "Rota" si, TRAS el final del impulso, el precio ya retrocedió más allá del nivel
  // profundo. Empieza en pEnd.index + 1 para no contar la propia vela del pivote.
  let broken = false
  for (let i = pEnd.index + 1; i < candles.length; i++) {
    if (up ? candles[i].low < deepPrice : candles[i].high > deepPrice) {
      broken = true
      break
    }
  }

  const last = candles[candles.length - 1]
  const stepMs = Math.max(1, last.timestamp - candles[candles.length - 2].timestamp)
  return {
    fromTs: pEnd.timestamp,
    toTs: last.timestamp + PROJECT_BARS * stepMs,
    levels,
    bandLow: Math.min(bandA, bandB),
    bandHigh: Math.max(bandA, bandB),
    broken,
    direction: up ? 'up' : 'down',
  }
}
