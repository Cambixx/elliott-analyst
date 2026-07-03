import type { Pivot } from './types'

/** Fuerza ORDINAL del nivel (terciles dentro del set devuelto): lenguaje discreto,
 *  nunca un score numérico que finja precisión. */
export type SrStrength = 'fuerte' | 'moderada' | 'débil'

export interface SrLevel {
  /** Precio representativo del nivel: MEDIANA de los toques (robusta a mechas outlier). */
  price: number
  /** Cuántos pivotes (swings) han reaccionado en este nivel. */
  touches: number
  /** Índice de vela del toque más reciente (para el decaimiento por recencia). */
  lastIndex: number
  /** Borde inferior de la ZONA: el toque más bajo del cluster (dispersión real). */
  low: number
  /** Borde superior de la ZONA: el toque más alto del cluster. */
  high: number
  strength: SrStrength
}

export interface SrOptions {
  /**
   * Tolerancia relativa máxima de ANCHURA del nivel (default 0,6%). El caller debería
   * derivarla de la volatilidad (p.ej. clamp(0.5·ATR14/close, 0.003, 0.015)): fija
   * sobre-agrupa en mercados tranquilos y fragmenta en volátiles.
   */
  tolerancePct?: number
  /** Toques mínimos para considerar el nivel significativo (default 2). */
  minTouches?: number
  /** Máximo de niveles a devolver (default 6). */
  max?: number
  /** Índice de vela "actual" para la recencia (default: mayor índice de pivote). */
  nowIndex?: number
}

/** Un nivel sin tocarse pierde la mitad de su vigencia cada HALF_LIFE velas. */
const HALF_LIFE = 150

function medianPrice(sortedByPrice: Pivot[]): number {
  const n = sortedByPrice.length
  const mid = Math.floor(n / 2)
  return n % 2
    ? sortedByPrice[mid].price
    : (sortedByPrice[mid - 1].price + sortedByPrice[mid].price) / 2
}

/**
 * Detecta ZONAS horizontales de soporte/resistencia agrupando los pivotes del ZigZag
 * por proximidad de precio, con clustering aglomerativo 1D de enlace COMPLETO: dos
 * clusters vecinos solo se fusionan si la anchura TOTAL de la unión respeta la
 * tolerancia (a diferencia del agrupado codicioso contra la media, que encadenaba
 * toques y producía niveles más anchos que la propia tolerancia). El ranking combina
 * toques con decaimiento por recencia: un nivel muy tocado pero abandonado hace
 * cientos de velas pesa menos que uno reciente. La clasificación soporte/resistencia
 * depende del precio actual, así que se decide al mostrarlos (ver `classifyLevel`).
 */
export function supportResistance(pivots: Pivot[], opts: SrOptions = {}): SrLevel[] {
  const tol = opts.tolerancePct ?? 0.006
  const minTouches = opts.minTouches ?? 2
  const max = opts.max ?? 6
  if (pivots.length < 2) return []

  const sorted = [...pivots].filter((p) => p.price > 0).sort((a, b) => a.price - b.price)
  if (sorted.length < 2) return []
  const nowIndex = opts.nowIndex ?? sorted.reduce((m, p) => Math.max(m, p.index), 0)

  // Aglomerativo 1D: cada pivote arranca como cluster; en cada paso se fusiona el PAR
  // VECINO cuya unión quede más estrecha, solo si respeta la tolerancia (enlace
  // completo). Los clusters vecinos concatenados siguen ordenados por precio.
  const clusters: Pivot[][] = sorted.map((p) => [p])
  for (;;) {
    let bestI = -1
    let bestWidth = Infinity
    for (let i = 0; i + 1 < clusters.length; i++) {
      const a = clusters[i]
      const b = clusters[i + 1]
      const lo = a[0].price
      const hi = b[b.length - 1].price
      const width = (hi - lo) / medianPrice([...a, ...b])
      if (width <= tol && width < bestWidth) {
        bestWidth = width
        bestI = i
      }
    }
    if (bestI < 0) break
    clusters.splice(bestI, 2, [...clusters[bestI], ...clusters[bestI + 1]])
  }

  const levels = clusters
    .filter((c) => c.length >= minTouches)
    .map((c) => ({
      price: medianPrice(c),
      touches: c.length,
      lastIndex: c.reduce((m, x) => Math.max(m, x.index), 0),
      low: c[0].price,
      high: c[c.length - 1].price,
    }))

  // Vigencia = toques × decaimiento exponencial por velas sin tocar el nivel.
  const score = (l: (typeof levels)[number]) =>
    l.touches * 2 ** (-(nowIndex - l.lastIndex) / HALF_LIFE)
  const ranked = levels.sort((a, b) => score(b) - score(a)).slice(0, max)

  // Fuerza ordinal por terciles del set devuelto (relativa, no absoluta).
  const n = ranked.length
  return ranked.map((l, i) => ({
    ...l,
    strength: i < n / 3 ? 'fuerte' : i < (2 * n) / 3 ? 'moderada' : 'débil',
  }))
}

/**
 * Clasifica un nivel respecto al precio actual usando su ZONA real [low, high]
 * (con una banda mínima `bandPct` para zonas degeneradas de toques casi idénticos).
 */
export function classifyLevel(
  level: SrLevel,
  price: number,
  bandPct = 0.003,
): 'soporte' | 'resistencia' | 'en-precio' {
  const lo = Math.min(level.low, level.price * (1 - bandPct))
  const hi = Math.max(level.high, level.price * (1 + bandPct))
  if (price >= lo && price <= hi) return 'en-precio'
  return level.price > price ? 'resistencia' : 'soporte'
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
