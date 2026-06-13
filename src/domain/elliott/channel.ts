import type { Candle } from '@/types/market'
import type { Direction, Pivot } from './types'

/** Valor con signo según dirección (igual que el detector: "up" crece, "down" se invierte). */
const sval = (price: number, dir: Direction) => (dir === 'up' ? price : -price)

/** Valor de una recta (en espacio val) que pasa por (i0,v0)-(i1,v1), evaluada en `at`. */
function lineAt(i0: number, v0: number, i1: number, v1: number, at: number): number | null {
  if (i1 === i0) return null
  return v0 + ((v1 - v0) / (i1 - i0)) * (at - i0)
}

/**
 * Objetivo de la onda 5 por CANALIZACIÓN (Frost & Prechter): se traza la base
 * uniendo los finales de las ondas 2 y 4, y una paralela que toca el final de la
 * onda 3; el objetivo de la onda 5 es esa paralela evaluada en el tiempo actual.
 * CASO ESPECIAL: si la onda 3 es casi vertical (extensión > 2×onda 1), la paralela
 * desde la onda 3 queda demasiado alta → se ancla al final de la onda 1.
 * Devuelve un precio (>0) o null si no es calculable.
 */
export function wave5ChannelTarget(p: Pivot[], dir: Direction): number | null {
  if (p.length < 6) return null
  const v = (i: number) => sval(p[i].price, dir)
  const idx = (i: number) => p[i].index
  const w1 = v(1) - v(0)
  const w3 = v(3) - v(2)
  if (w1 <= 0) return null

  const slopeDenom = idx(4) - idx(2)
  if (slopeDenom <= 0) return null
  const m = (v(4) - v(2)) / slopeDenom

  const nearVertical = w3 / w1 > 2.0
  const anchorIdx = nearVertical ? idx(1) : idx(3)
  const anchorVal = nearVertical ? v(1) : v(3)

  const targetVal = anchorVal + m * (idx(5) - anchorIdx)
  const price = dir === 'up' ? targetVal : -targetVal
  return Number.isFinite(price) && price > 0 ? price : null
}

export interface ChannelLines {
  /** Línea base 0-2 (soporte en alcista) por índice. */
  lower: { i0: number; p0: number; i1: number; p1: number }
  /** Línea 1-3 (resistencia en alcista) por índice. */
  upper: { i0: number; p0: number; i1: number; p1: number }
}

/** Líneas del canal de impulso (0-2 y 1-3) en coordenadas de precio, para dibujar. */
export function impulseChannelLines(p: Pivot[]): ChannelLines | null {
  if (p.length < 4) return null
  return {
    lower: { i0: p[0].index, p0: p[0].price, i1: p[2].index, p1: p[2].price },
    upper: { i0: p[1].index, p0: p[1].price, i1: p[3].index, p1: p[3].price },
  }
}

/**
 * Puntos {timestamp, value} para dibujar el canal extendido desde el origen del
 * impulso hasta su final: [lowerInicio, lowerFin, upperInicio, upperFin].
 * En espacio de PRECIO real (el dibujo no depende de la dirección).
 */
export function channelDrawPoints(p: Pivot[]): { timestamp: number; value: number }[] | null {
  if (p.length < 6) return null
  const a = p[0].index
  const b = p[5].index
  const lo0 = lineAt(p[0].index, p[0].price, p[2].index, p[2].price, a)
  const lo1 = lineAt(p[0].index, p[0].price, p[2].index, p[2].price, b)
  const up0 = lineAt(p[1].index, p[1].price, p[3].index, p[3].price, a)
  const up1 = lineAt(p[1].index, p[1].price, p[3].index, p[3].price, b)
  if (lo0 == null || lo1 == null || up0 == null || up1 == null) return null
  return [
    { timestamp: p[0].timestamp, value: lo0 },
    { timestamp: p[5].timestamp, value: lo1 },
    { timestamp: p[0].timestamp, value: up0 },
    { timestamp: p[5].timestamp, value: up1 },
  ]
}

/**
 * Contención en el canal de impulso: cuenta los cierres que rebasan el canal
 * 0-2 / 1-3 por más de `tolAtr`×rango-del-canal. Un impulso sano queda
 * razonablemente contenido (pocas rupturas, salvo throw-overs en 3 y 5).
 */
export function impulseChannelContainment(
  candles: Candle[],
  p: Pivot[],
  dir: Direction,
): { breaches: number; bars: number; contained: boolean } {
  const v = (i: number) => sval(p[i].price, dir)
  const idx = (i: number) => p[i].index
  const lo = idx(0)
  const hi = idx(5)
  let breaches = 0
  let bars = 0
  for (let i = lo; i <= hi && i < candles.length; i++) {
    const upper = lineAt(idx(1), v(1), idx(3), v(3), i)
    const lower = lineAt(idx(0), v(0), idx(2), v(2), i)
    if (upper == null || lower == null) continue
    const width = Math.abs(upper - lower)
    const tol = 0.15 * width
    const cv = sval(candles[i].close, dir)
    bars++
    if (cv > upper + tol || cv < lower - tol) breaches++
  }
  // Tolera throw-overs puntuales: contenido si <15% de los cierres rompen el canal.
  const contained = bars > 0 && breaches / bars < 0.15
  return { breaches, bars, contained }
}
