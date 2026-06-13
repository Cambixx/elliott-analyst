import type { Candle } from '@/types/market'
import type { PriceZone } from './types'
import { detectScenariosMultiDegree } from './detector'

/** Lista de grados usada en vivo (useElliott) y en el backtest, para que coincidan. */
export const degreeList = (sensitivity: number): number[] => [
  sensitivity * 0.65,
  sensitivity,
  sensitivity * 1.6,
]

export interface Outcome {
  /** Score del conteo en el momento de la evaluación. */
  score: number
  /** true si el precio alcanzó la zona objetivo ANTES que la invalidación. */
  hit: boolean
  /** Velas hasta resolverse. */
  bars: number
  /** Keys de los factores de confluencia que estaban cumplidos (para el lift por factor).
   * No afecta al cálculo de `hit` (puramente geométrico). */
  metKeys: string[]
}

export interface BacktestResult {
  /** Desenlaces de conteos CONFIRMADOS (impulso/diagonal completados). */
  outcomes: Outcome[]
  /** Conteos confirmados resueltos dentro del horizonte. */
  resolved: number
  /** Desenlaces de PRONÓSTICOS EN DESARROLLO (continuación hacia el objetivo de la onda en curso). */
  developingOutcomes: Outcome[]
  /** Pronósticos en desarrollo resueltos dentro del horizonte. */
  developingResolved: number
  /** Puntos de evaluación recorridos. */
  evaluated: number
  /** Paso de muestreo usado (1 = cada vela). */
  step: number
}

export interface FirstPassage {
  hit: boolean
  bars: number
}

/**
 * Resolución first-passage SIN look-ahead: dado el precio de entrada, la zona
 * objetivo y el nivel de invalidación, recorre SOLO las velas futuras y devuelve
 * qué se tocó primero (objetivo → hit; invalidación → miss), o null si no se
 * resolvió en el horizonte. Exige que objetivo e invalidación queden en lados
 * OPUESTOS de la entrada (apuesta direccional limpia); si no, devuelve null.
 */
export function firstPassage(
  entry: number,
  target: PriceZone,
  invalidation: number,
  future: Candle[],
): FirstPassage | null {
  const targetMid = (target.low + target.high) / 2
  const targetAbove = targetMid > entry
  const invAbove = invalidation > entry
  if (targetAbove === invAbove) return null // mismo lado: ambiguo

  for (let j = 0; j < future.length; j++) {
    const c = future[j]
    const touchedTarget = c.high >= target.low && c.low <= target.high
    const hitInv = invAbove ? c.high >= invalidation : c.low <= invalidation
    if (touchedTarget && hitInv) {
      // Ambos niveles tocados en la MISMA vela: el orden intrabar es desconocido
      // con solo OHLC. Para una tasa de acierto honesta resolvemos al peor caso
      // (miss), evitando inflar la frecuencia con velas de rango amplio/gaps.
      return { hit: false, bars: j + 1 }
    }
    if (touchedTarget) return { hit: true, bars: j + 1 }
    if (hitInv) return { hit: false, bars: j + 1 }
  }
  return null
}

export interface BacktestOptions {
  /** Velas futuras a mirar para resolver cada conteo. */
  horizon?: number
  /** Tope de evaluaciones (controla el coste; muestrea uniformemente la historia). */
  maxEvaluations?: number
  /** Mínimo de velas iniciales antes de empezar a evaluar (calienta indicadores). */
  warmup?: number
}

/**
 * Backtest walk-forward del motor sobre velas históricas, SIN look-ahead:
 * en cada punto t solo el prefijo candles[0..t] entra al detector, y el
 * desenlace se mide exclusivamente sobre velas posteriores. Mide la UTILIDAD
 * del conteo (¿llega a su zona objetivo antes que a la invalidación?), NO la
 * rentabilidad de una operación (no incluye costes ni gestión).
 *
 * Evalúa DOS pistas: (A) conteos confirmados (impulso/diagonal completados) y
 * (B) pronósticos de continuación de ondas EN DESARROLLO. Deduplica cada conteo
 * (los confirmados por id; los developing por identidad estable patrón+dir+origen,
 * porque su id lleva el pivote en curso que se mueve cada vela).
 */
export function runBacktest(
  candles: Candle[],
  sensitivity: number,
  opts: BacktestOptions = {},
): BacktestResult {
  const horizon = opts.horizon ?? 24
  const maxEvaluations = opts.maxEvaluations ?? 300
  const warmup = opts.warmup ?? 50

  const closed = candles.filter((c) => c.closed)
  const n = closed.length
  const empty: BacktestResult = {
    outcomes: [],
    resolved: 0,
    developingOutcomes: [],
    developingResolved: 0,
    evaluated: 0,
    step: 0,
  }
  if (n < warmup + horizon + 10) return empty

  const span = n - horizon - warmup
  const step = Math.max(1, Math.ceil(span / maxEvaluations))
  const outcomes: Outcome[] = []
  const developingOutcomes: Outcome[] = []
  const seen = new Set<string>()
  const seenDev = new Set<string>()
  let evaluated = 0

  const metKeysOf = (sc: { confluence: { factors: { met: boolean; key: string }[] } }) =>
    sc.confluence.factors.filter((f) => f.met).map((f) => f.key)

  const kList = degreeList(sensitivity)
  for (let t = warmup; t < n - horizon; t += step) {
    const prefix = closed.slice(0, t + 1) // SOLO el pasado
    // Mismo pipeline multi-grado que la UI en vivo → la calibración mide los
    // MISMOS scores que verá el usuario (no un detector single-k distinto).
    const { scenarios } = detectScenariosMultiDegree(prefix, kList)
    const entry = prefix[prefix.length - 1].close
    const future = closed.slice(t + 1, t + 1 + horizon) // SOLO el futuro
    evaluated++

    // (A) Mejor conteo CONFIRMADO con objetivo direccional limpio (impulso/diagonal
    // completados). Triángulos a ambos lados; ABC/WXY completados no llevan target.
    const conf = scenarios.find(
      (x) => !x.developing && x.target && x.pattern !== 'triangulo' && x.pattern !== 'wxy',
    )
    if (conf?.target && !seen.has(conf.id)) {
      seen.add(conf.id)
      const res = firstPassage(entry, conf.target, conf.invalidation.price, future)
      if (res) outcomes.push({ score: conf.score, hit: res.hit, bars: res.bars, metKeys: metKeysOf(conf) })
    }

    // (B) Mejor PRONÓSTICO EN DESARROLLO con objetivo de continuación (la onda en
    // curso hacia su objetivo, invalidación al lado opuesto). Mide EXACTAMENTE la
    // utilidad de los pronósticos en desarrollo, que es lo que más interesa operar.
    const dev = scenarios.find((x) => x.developing && x.target && x.pattern !== 'triangulo')
    if (dev?.target) {
      // Dedup por identidad ESTABLE de la onda (patrón+dir+origen): el id incluye
      // el pivote en curso que se mueve cada vela, así que el id NO deduplica el
      // mismo pronóstico evaluado en barras consecutivas.
      const devKey = `${dev.pattern}-${dev.direction}-${dev.pivots[0].index}`
      // Solo se cuenta si el objetivo está POR DELANTE del precio (aún hay recorrido):
      // si el precio ya está dentro de la zona, el conteo no mide "llegar al objetivo".
      const inZone = entry >= dev.target.low && entry <= dev.target.high
      if (!seenDev.has(devKey) && !inZone) {
        seenDev.add(devKey)
        const res = firstPassage(entry, dev.target, dev.invalidation.price, future)
        if (res)
          developingOutcomes.push({ score: dev.score, hit: res.hit, bars: res.bars, metKeys: metKeysOf(dev) })
      }
    }
  }

  return {
    outcomes,
    resolved: outcomes.length,
    developingOutcomes,
    developingResolved: developingOutcomes.length,
    evaluated,
    step,
  }
}
