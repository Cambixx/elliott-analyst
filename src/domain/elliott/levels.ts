import type { Pivot } from './types'

export interface SrLevel {
  /** Precio representativo del nivel (media de los toques agrupados). */
  price: number
  /** Cuántos pivotes (swings) han reaccionado en este nivel. */
  touches: number
  /** Índice de vela del toque más reciente (para ordenar por vigencia). */
  lastIndex: number
}

export interface SrOptions {
  /** Tolerancia relativa para agrupar precios en un mismo nivel (default 0,6%). */
  tolerancePct?: number
  /** Toques mínimos para considerar el nivel significativo (default 2). */
  minTouches?: number
  /** Máximo de niveles a devolver (default 6). */
  max?: number
}

/**
 * Detecta niveles horizontales de SOPORTE/RESISTENCIA agrupando los pivotes del
 * ZigZag por proximidad de precio: un precio donde el mercado ha reaccionado varias
 * veces es estructura relevante. Devuelve los niveles más fuertes (por nº de toques,
 * desempatando por vigencia). La clasificación soporte/resistencia depende del precio
 * actual, así que se decide al mostrarlos (ver `classifyLevel`).
 */
export function supportResistance(pivots: Pivot[], opts: SrOptions = {}): SrLevel[] {
  const tol = opts.tolerancePct ?? 0.006
  const minTouches = opts.minTouches ?? 2
  const max = opts.max ?? 6
  if (pivots.length < 2) return []

  // Ordenar por precio y agrupar de forma codiciosa los que caen dentro de la
  // tolerancia respecto a la media móvil del grupo en curso.
  const sorted = [...pivots].filter((p) => p.price > 0).sort((a, b) => a.price - b.price)
  const clusters: Pivot[][] = []
  let current: Pivot[] = []
  for (const p of sorted) {
    if (current.length === 0) {
      current = [p]
      continue
    }
    const avg = current.reduce((s, x) => s + x.price, 0) / current.length
    if (Math.abs(p.price - avg) / avg <= tol) current.push(p)
    else {
      clusters.push(current)
      current = [p]
    }
  }
  if (current.length) clusters.push(current)

  const levels: SrLevel[] = clusters
    .filter((c) => c.length >= minTouches)
    .map((c) => ({
      price: c.reduce((s, x) => s + x.price, 0) / c.length,
      touches: c.length,
      lastIndex: c.reduce((m, x) => Math.max(m, x.index), 0),
    }))

  // Más fuertes primero: más toques, y a igualdad, más recientes.
  return levels.sort((a, b) => b.touches - a.touches || b.lastIndex - a.lastIndex).slice(0, max)
}

/** Clasifica un nivel respecto al precio actual (con una pequeña banda de "en precio"). */
export function classifyLevel(
  level: SrLevel,
  price: number,
  bandPct = 0.003,
): 'soporte' | 'resistencia' | 'en-precio' {
  const diff = (level.price - price) / price
  if (Math.abs(diff) <= bandPct) return 'en-precio'
  return diff > 0 ? 'resistencia' : 'soporte'
}

/** Nivel S/R más cercano a un precio dado dentro de una tolerancia (o null). */
export function nearestLevel(price: number, levels: SrLevel[], tolPct = 0.006): SrLevel | null {
  let best: SrLevel | null = null
  let bestDist = Infinity
  for (const l of levels) {
    const dist = Math.abs(l.price - price) / price
    if (dist <= tolPct && dist < bestDist) {
      best = l
      bestDist = dist
    }
  }
  return best
}
