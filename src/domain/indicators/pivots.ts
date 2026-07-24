import type { Candle } from '@/types/market'

/** Un pivote fractal: un máximo o mínimo local ya confirmado. */
export interface FractalPivot {
  index: number
  timestamp: number
  /** Precio del pivote: el `high` si es máximo, el `low` si es mínimo. */
  price: number
  type: 'high' | 'low'
}

/** Un nivel de S/R proyectado desde un pivote, listo para dibujar como rayo horizontal. */
export interface PivotLevel {
  price: number
  type: 'high' | 'low'
  /** timestamp del pivote de origen: el nivel se proyecta hacia delante desde ahí. */
  timestamp: number
}

/**
 * Fuerza del fractal (velas a cada lado). 3 ≈ swings visibles sin exceso de ruido,
 * al estilo del indicador de CRECETRADER (triángulos frecuentes). El retardo de
 * confirmación es de `right` velas: un pivote NO se marca hasta tener `right` velas
 * cerradas a su derecha, así nunca se mueve al llegar nuevas velas (anti-repaint).
 */
export const PIVOT_STRENGTH = 3
/** Máximo de niveles de pivote dibujados a la vez (los más cercanos, encuadrando el precio). */
export const MAX_PIVOT_LEVELS = 7
/** Dos pivotes a menos de este % se consideran el MISMO nivel (no se apilan rayos). */
export const PIVOT_LEVEL_DEDUP_PCT = 0.004

/**
 * Detecta pivotes fractales (swings) al estilo Williams: hay pivote ALTO en la vela `i`
 * si su `high` es estrictamente mayor que el de TODAS las velas en [i-left, i+right]; hay
 * pivote BAJO si su `low` es estrictamente menor que el de todas ellas. Los triángulos que
 * dibuja CRECETRADER encima/debajo de algunas velas son exactamente esto: máximos y mínimos
 * locales.
 *
 * ANTI-REPAINT (clave, coherente con el resto del motor): un pivote solo se emite cuando ya
 * tiene `right` velas a su derecha (`i < n - right`), y esas velas deben estar CERRADAS. La
 * función se autoprotege: si la última vela está en formación (`closed === false`) la excluye
 * —ni es pivote ni sirve de vecino derecho—, de modo que ningún pivote confirmado depende de
 * un high/low que aún se mueve. Así el marcado es definitivo aunque el llamador pase la vela
 * viva; en la práctica se le pasan solo velas cerradas y el resultado es el mismo. Un prefijo
 * de la serie produce un prefijo EXACTO de los pivotes (extender el array nunca reescribe ni
 * borra un pivote previo): esa estabilidad es la propiedad anti-repaint que el proyecto exige.
 *
 * Igualdad: la comparación es estricta (`>=`/`<=` descalifica), de modo que una meseta de
 * dos máximos idénticos no genera dos pivotes espurios (ninguno gana al empatar). En datos
 * de mercado reales los empates exactos son raros; este criterio es el conservador.
 */
export function fractalPivots(
  candles: Candle[],
  { left = PIVOT_STRENGTH, right = PIVOT_STRENGTH }: { left?: number; right?: number } = {},
): FractalPivot[] {
  const out: FractalPivot[] = []
  // Excluye velas finales en formación: nunca deben ser pivote ni vecino derecho.
  let n = candles.length
  while (n > 0 && candles[n - 1].closed === false) n--
  for (let i = left; i < n - right; i++) {
    const c = candles[i]
    let isHigh = true
    let isLow = true
    for (let j = i - left; j <= i + right; j++) {
      if (j === i) continue
      if (candles[j].high >= c.high) isHigh = false
      if (candles[j].low <= c.low) isLow = false
      if (!isHigh && !isLow) break
    }
    if (isHigh) out.push({ index: i, timestamp: c.timestamp, price: c.high, type: 'high' })
    if (isLow) out.push({ index: i, timestamp: c.timestamp, price: c.low, type: 'low' })
  }
  return out
}

/**
 * Filtro de ESTRUCTURA DE MERCADO (estilo CRECETRADER): de todos los pivotes fractales deja
 * solo los que EXTIENDEN la tendencia vigente. En tendencia alcista (`trendUp[i] === true`)
 * conserva máximos crecientes (higher highs) y mínimos crecientes (higher lows); en bajista,
 * máximos y mínimos decrecientes. Los pivotes contra-tendencia (un máximo más bajo dentro de
 * un tramo alcista, etc.) se descartan como ruido. Al cambiar el sentido de la tendencia se
 * reinician las referencias, de modo que el primer máximo y el primer mínimo del nuevo tramo
 * siempre se marcan (el giro) y a partir de ahí manda la monotonía del nuevo sentido.
 *
 * `trendUp` va indexado por índice de vela (p.ej. pendiente de la EMA50). Recibe los pivotes
 * en orden cronológico (como los devuelve `fractalPivots`) y preserva ese orden.
 */
export function trendConsistentPivots(pivots: FractalPivot[], trendUp: boolean[]): FractalPivot[] {
  const out: FractalPivot[] = []
  let lastHigh: number | null = null
  let lastLow: number | null = null
  let curUp: boolean | null = null
  for (const p of pivots) {
    const up = trendUp[p.index] ?? true
    if (up !== curUp) {
      // La tendencia cambió de sentido: arranca una secuencia estructural nueva.
      lastHigh = null
      lastLow = null
      curUp = up
    }
    if (p.type === 'high') {
      const keep = lastHigh === null || (up ? p.price > lastHigh : p.price < lastHigh)
      if (keep) {
        out.push(p)
        lastHigh = p.price
      }
    } else {
      const keep = lastLow === null || (up ? p.price > lastLow : p.price < lastLow)
      if (keep) {
        out.push(p)
        lastLow = p.price
      }
    }
  }
  return out
}

/**
 * Selecciona los niveles de pivote a dibujar. Primero deduplica: recorre de MÁS RECIENTE a
 * más antiguo y queda con precios que no estén ya cubiertos por otro nivel más nuevo (dentro
 * de `tolPct`), conservando el timestamp del pivote más reciente de cada banda (evita apilar
 * rayos casi solapados). Después, si se da `price`, selecciona los `count` niveles más
 * CERCANOS ENCUADRANDO el precio actual (~mitad por encima como resistencia, mitad por debajo
 * como soporte, rellenando desde el otro lado si uno se queda corto) — el aspecto de los
 * gráficos de CRECETRADER, y lo más útil como S/R vigente. Sin `price`, devuelve los más
 * recientes hasta `count`.
 */
export function pivotLevels(
  pivots: FractalPivot[],
  {
    price,
    count = MAX_PIVOT_LEVELS,
    tolPct = PIVOT_LEVEL_DEDUP_PCT,
  }: { price?: number; count?: number; tolPct?: number } = {},
): PivotLevel[] {
  const distinct: PivotLevel[] = []
  for (let i = pivots.length - 1; i >= 0; i--) {
    const p = pivots[i]
    // Rechaza no-finitos además de ≤0: un NaN colado del feed dibujaría un rayo con etiqueta
    // rota (o se descartaría en silencio con `price`, según la rama) — mejor filtrarlo aquí.
    if (!Number.isFinite(p.price) || p.price <= 0) continue
    if (distinct.some((l) => Math.abs(l.price - p.price) / p.price < tolPct)) continue
    distinct.push({ price: p.price, type: p.type, timestamp: p.timestamp })
  }
  if (price == null || !Number.isFinite(price)) return distinct.slice(0, count)
  const above = distinct.filter((l) => l.price > price).sort((a, b) => a.price - b.price)
  const below = distinct.filter((l) => l.price <= price).sort((a, b) => b.price - a.price)
  const nAbove0 = Math.min(above.length, Math.ceil(count / 2))
  const nBelow = Math.min(below.length, count - nAbove0)
  const nAbove = Math.min(above.length, count - nBelow) // rellena por arriba si abajo va corto
  return [...above.slice(0, nAbove), ...below.slice(0, nBelow)]
}
