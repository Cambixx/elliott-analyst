import type { Candle } from '@/types/market'
import type { Pivot } from './types'
import { computeATR } from './atr'

/**
 * ZigZag adaptativo por ATR. Reduce las velas a una secuencia alternante de
 * pivotes (high/low). El umbral de reversión es `k · ATR`, así que se adapta a
 * la volatilidad. El último pivote se marca `confirmed: false` (provisional):
 * puede repintar al llegar nuevas velas → clave para no generar señales falsas.
 *
 * @param k sensibilidad. Mayor k = menos pivotes / ondas de mayor grado.
 */
export function zigzag(candles: Candle[], k = 3, atrPeriod = 14): Pivot[] {
  const n = candles.length
  if (n < 3) return []

  const atr = computeATR(candles, atrPeriod)
  const pivots: Pivot[] = []

  // Añade un pivote, pero si cae en el MISMO índice que el anterior lo reemplaza
  // (evita el pivote fantasma de longitud 0 cuando el mercado arranca cayendo y la
  // semilla 'low@0' choca con el primer 'high@0').
  const pushPivot = (p: Pivot) => {
    const last = pivots[pivots.length - 1]
    if (last && last.index === p.index) pivots[pivots.length - 1] = p
    else pivots.push(p)
  }

  // Semilla: el primer pivote (provisional) es un mínimo en el índice 0.
  let trend: 1 | -1 = 1
  let extremeIdx = 0
  let extremePrice = candles[0].low
  pushPivot({
    index: 0,
    timestamp: candles[0].timestamp,
    price: candles[0].low,
    type: 'low',
    confirmed: true,
  })

  for (let i = 1; i < n; i++) {
    const threshold = k * (atr[i] || atr[0] || 0)

    if (trend > 0) {
      // Buscando un máximo: seguimos el high más alto.
      if (candles[i].high > extremePrice) {
        extremePrice = candles[i].high
        extremeIdx = i
      } else if (candles[i].low < extremePrice - threshold) {
        // Reversión confirmada → fijamos pivote alto en el extremo.
        pushPivot({
          index: extremeIdx,
          timestamp: candles[extremeIdx].timestamp,
          price: extremePrice,
          type: 'high',
          confirmed: true,
        })
        trend = -1
        extremePrice = candles[i].low
        extremeIdx = i
      }
    } else {
      // Buscando un mínimo: seguimos el low más bajo.
      if (candles[i].low < extremePrice) {
        extremePrice = candles[i].low
        extremeIdx = i
      } else if (candles[i].high > extremePrice + threshold) {
        pushPivot({
          index: extremeIdx,
          timestamp: candles[extremeIdx].timestamp,
          price: extremePrice,
          type: 'low',
          confirmed: true,
        })
        trend = 1
        extremePrice = candles[i].high
        extremeIdx = i
      }
    }
  }

  // Pivote final provisional (extremo en curso, sin reversión confirmada).
  const last = pivots[pivots.length - 1]
  if (!last || last.index !== extremeIdx) {
    pushPivot({
      index: extremeIdx,
      timestamp: candles[extremeIdx].timestamp,
      price: extremePrice,
      type: trend > 0 ? 'high' : 'low',
      confirmed: false,
    })
  }

  // Marca causal de pivotes de baja fiabilidad (mecha desproporcionada / baja liquidez).
  for (const p of pivots) p.flag = classifyPivot(candles, atr, p)

  return pivots
}

/**
 * Filtro fractal de Williams: descarta pivotes que NO son un extremo estricto en
 * la ventana [index-halfWin, index+halfWin] (micro-zigzags), y recolapsa para
 * mantener la alternancia high/low (ante dos del mismo tipo seguidos, conserva el
 * más extremo). El primer y el último pivote (provisional) se conservan siempre.
 */
export function williamsFilter(pivots: Pivot[], candles: Candle[], halfWin = 2): Pivot[] {
  if (pivots.length <= 2) return pivots

  const isExtreme = (p: Pivot): boolean => {
    const lo = Math.max(0, p.index - halfWin)
    const hi = Math.min(candles.length - 1, p.index + halfWin)
    for (let i = lo; i <= hi; i++) {
      if (i === p.index) continue
      if (p.type === 'high' && candles[i].high > p.price) return false
      if (p.type === 'low' && candles[i].low < p.price) return false
    }
    return true
  }

  const kept = pivots.filter(
    (p, i) => i === 0 || i === pivots.length - 1 || !p.confirmed || isExtreme(p),
  )

  // Recolapsar alternancia: tras quitar pivotes pueden quedar dos del mismo tipo.
  const out: Pivot[] = []
  for (let i = 0; i < kept.length; i++) {
    const p = kept[i]
    const last = out[out.length - 1]
    if (last && last.type === p.type) {
      // El ÚLTIMO pivote (provisional/extremo en curso) es inamovible: ante
      // colisión de tipo se conserva él (descartando el predecesor interior),
      // no el más extremo — preservar el provisional es clave para el anti-repaint.
      const isLast = i === kept.length - 1
      if (isLast && out.length > 1) {
        out[out.length - 1] = p
      } else {
        const moreExtreme = p.type === 'high' ? p.price > last.price : p.price < last.price
        if (moreExtreme) out[out.length - 1] = p
      }
    } else {
      out.push(p)
    }
  }
  return out
}

/** Mediana del volumen en la ventana [i-win, i-1] (causal, sin incluir la propia vela). */
function recentMedianVolume(candles: Candle[], i: number, win = 14): number {
  const lo = Math.max(0, i - win)
  const vols: number[] = []
  for (let j = lo; j < i; j++) vols.push(candles[j].volume)
  if (vols.length === 0) return candles[i]?.volume ?? 0
  vols.sort((a, b) => a - b)
  const mid = Math.floor(vols.length / 2)
  return vols.length % 2 ? vols[mid] : (vols[mid - 1] + vols[mid]) / 2
}

/**
 * Clasifica un pivote como de baja fiabilidad usando SOLO información hasta su
 * propia vela (causal): mecha desproporcionada respecto al ATR previo, o volumen
 * muy por debajo de la mediana reciente. Devuelve undefined si es normal.
 */
function classifyPivot(candles: Candle[], atr: number[], p: Pivot): Pivot['flag'] {
  const c = candles[p.index]
  if (!c) return undefined
  // ATR de la vela ANTERIOR (no la propia): una vela-mecha enorme infla su propio
  // ATR y enmascararía el umbral. Sin fallback a info futura (atr de la serie final).
  const prevAtr = p.index > 0 ? atr[p.index - 1] : NaN
  const a = Number.isFinite(prevAtr) && prevAtr > 0 ? prevAtr : atr[p.index] || 0

  // Mecha del extremo: para un high, la mecha superior; para un low, la inferior.
  const body = Math.max(c.open, c.close)
  const bodyLow = Math.min(c.open, c.close)
  const wick = p.type === 'high' ? c.high - body : bodyLow - c.low
  if (a > 0 && wick > 2.5 * a) return 'wick_spike'

  const med = recentMedianVolume(candles, p.index)
  if (med > 0 && c.volume < 0.4 * med) return 'low_liquidity'

  return undefined
}
