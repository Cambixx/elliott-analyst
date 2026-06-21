import type { Candle } from '@/types/market'
import type { Pivot } from './types'

// --- Parámetros CONGELADOS (3 grados de libertad; ver vsa.test.ts) ---------------
/**
 * Ventana del percentil causal. De la familia 14–20 que ya usa el motor (ATR=14,
 * RSI=14, mediana de volumen win=14 en zigzag); 20 da algo de cola al percentil sin
 * abarcar otro régimen de liquidez. Un solo lookback fija TODA la normalización
 * (no hay z-score ni MAD que sintonizar).
 */
const LOOKBACK = 20
/** Percentil de volumen para "esfuerzo/clímax": top quintil de su historia reciente
 *  (alto, pero no el extremo p95 que casi nunca dispararía ni el outlier aislado). */
const VOL_HI = 0.8
/** Partición del rango de la vela en tercios: el cierre debe quedar en el tercio CONTRA
 *  el extremo (techo → tercio inferior ≤0.33; suelo → tercio superior ≥1−0.33). */
const CLV_REJECT = 0.33

/**
 * Rank percentil robusto (0..1) de `value` dentro de `window`: fracción de elementos
 * finitos < value más medio empate (mid-rank). Solo usa ORDEN, no magnitud → inmune a
 * múltiplos absolutos y a picos de wash-trading (el eje que Wyckoff pone en el centro y
 * que en cripto está contaminado). Puro sobre el array recibido; el llamador garantiza
 * que `window` son SOLO velas anteriores al pivote (sin look-ahead).
 *
 * CAVEAT (varianza nula): al ser scale-free, sobre una ventana SIN dispersión (todos los
 * valores iguales) CUALQUIER valor por encima da rank 1.0, sea un pico real o un +1; la
 * "tranquilidad" todos-iguales→0.5 solo aplica en igualdad EXACTA con `value`. Es un
 * artefacto de ventanas degeneradas que el volumen real de mercado nunca presenta (siempre
 * hay dispersión); no se "arregla" con un umbral de magnitud porque eso reintroduciría un
 * grado de libertad y daría falsos negativos en clímax legítimos (un pico 10× sobre fondo
 * plano SÍ es clímax). El factor que lo consume es además suave y exige CLV en AND.
 */
export function percentileRank(window: number[], value: number): number {
  const fin = window.filter(Number.isFinite)
  if (fin.length === 0) return 0.5 // sin datos: neutro (ni premia ni castiga)
  let lt = 0
  let eq = 0
  for (const w of fin) {
    if (w < value) lt++
    else if (w === value) eq++
  }
  return (lt + 0.5 * eq) / fin.length
}

/**
 * CLV = (close−low)/(high−low) ∈ [0,1]: posición del cierre dentro del rango de la vela.
 * ~1 = cierre en máximos (los compradores ganan la barra); ~0 = en mínimos. Devuelve null
 * en doji/sin rango, para que el factor lo trate como NO confirmatorio (no como un 0.5
 * inventado que fingiría un rechazo inexistente).
 */
export function closeLocationValue(c: Candle): number | null {
  const range = c.high - c.low
  if (!(range > 0)) return null
  return (c.close - c.low) / range
}

/**
 * Lectura VSA (esfuerzo/resultado) en el PIVOTE DE GIRO que Elliott marcó como fin del
 * patrón: ¿hubo clímax/absorción/distribución? = esfuerzo alto (volumen en percentil alto
 * sobre las velas ANTERIORES) CON rechazo del extremo (CLV contra el extremo, según el
 * tipo del pivote — high/low decide la simetría sin pasar `dir`). Predicado ÚNICO en AND,
 * no un OR de lecturas → no dispara más a menudo que el factor que reemplaza. El percentil
 * de spread solo alimenta el `detail` (esfuerzo sin resultado), nunca decide → 0 grados de
 * libertad extra. Sin look-ahead: lee la vela del giro (ya cerrada) y la ventana anterior.
 */
export function vsaTurnConfirms(
  candles: Candle[],
  turn: Pivot,
  lookback = LOOKBACK,
): { met: boolean; detail: string } {
  // Colisión con wick_spike: la geometría de "mecha que rechaza el extremo" es la misma
  // que el motor ya marca como baja fiabilidad. No premiamos lo que en otro plano penaliza.
  if (turn.flag === 'wick_spike') {
    return { met: false, detail: 'El giro se formó en una mecha desproporcionada: no cuenta como clímax VSA.' }
  }
  const i = turn.index
  // Guard defensivo de rango: el pipeline real acota turn.index a [0, len-1] (zigzag),
  // pero leer candles[i] fuera de rango lanzaría; degradamos en su lugar (benigno).
  if (i < 0 || i >= candles.length) {
    return { met: false, detail: 'Índice de giro fuera de rango: lectura VSA indefinida.' }
  }
  const lo = Math.max(0, i - lookback)
  if (i - lo < lookback) {
    return { met: false, detail: 'Datos de volumen insuficientes para leer el giro.' }
  }
  const clv = closeLocationValue(candles[i])
  if (clv === null) {
    return { met: false, detail: 'Vela del giro sin rango (doji): lectura VSA indefinida.' }
  }
  const win = candles.slice(lo, i) // [i-lookback, i-1] → excluye la vela i y todo el futuro
  const volPct = percentileRank(
    win.map((c) => c.volume),
    candles[i].volume,
  )
  const sprPct = percentileRank(
    win.map((c) => c.high - c.low),
    candles[i].high - candles[i].low,
  )
  const isHigh = turn.type === 'high'
  const rejected = isHigh ? clv <= CLV_REJECT : clv >= 1 - CLV_REJECT
  const met = volPct >= VOL_HI && rejected
  const detail = met
    ? `Vol p${Math.round(volPct * 100)} en el giro con cierre rechazado (CLV ${clv.toFixed(2)}, spread p${Math.round(sprPct * 100)}): posible distribución/absorción.`
    : `Sin firma VSA de giro (vol p${Math.round(volPct * 100)}, CLV ${clv.toFixed(2)}).`
  return { met, detail }
}
