import type { Candle } from '@/types/market'

export interface VwapPoint {
  timestamp: number
  value: number
}

export interface AnchoredVwap {
  /** Índice de vela donde se ancla el VWAP (p.ej. el origen del escenario). */
  anchorIndex: number
  /** Valor del VWAP en cada vela desde el ancla hasta el final (para dibujar). */
  points: VwapPoint[]
  /** Valor actual (última vela). */
  current: number
}

/**
 * VWAP ANCLADO: precio medio ponderado por volumen acumulado DESDE un ancla
 * (típicamente el origen de la estructura de Elliott). Es la referencia que miran
 * las mesas institucionales: por encima = los compradores desde el ancla mandan;
 * por debajo = los vendedores. Confluye muy bien con los objetivos de Fibonacci.
 *
 * Precio típico de cada vela = (high + low + close) / 3.
 */
export function anchoredVwap(candles: Candle[], anchorIndex: number): AnchoredVwap | null {
  if (anchorIndex < 0 || anchorIndex >= candles.length) return null

  let cumPV = 0
  let cumV = 0
  const points: VwapPoint[] = []
  for (let i = anchorIndex; i < candles.length; i++) {
    const c = candles[i]
    const tp = (c.high + c.low + c.close) / 3
    const vol = c.volume > 0 ? c.volume : 0
    cumPV += tp * vol
    cumV += vol
    // Si aún no hay volumen acumulado, el VWAP es el propio precio típico.
    points.push({ timestamp: c.timestamp, value: cumV > 0 ? cumPV / cumV : tp })
  }
  if (points.length === 0) return null
  return { anchorIndex, points, current: points[points.length - 1].value }
}
