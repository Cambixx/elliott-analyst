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
  outcomes: Outcome[]
  /** Conteos confirmados y resueltos dentro del horizonte. */
  resolved: number
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
 * Solo evalúa conteos COMPLETOS y CONFIRMADOS (los `developing` repintan).
 * Deduplica por id para no contar el mismo conteo en velas consecutivas.
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
  const empty: BacktestResult = { outcomes: [], resolved: 0, evaluated: 0, step: 0 }
  if (n < warmup + horizon + 10) return empty

  const span = n - horizon - warmup
  const step = Math.max(1, Math.ceil(span / maxEvaluations))
  const outcomes: Outcome[] = []
  const seen = new Set<string>()
  let evaluated = 0

  const kList = degreeList(sensitivity)
  for (let t = warmup; t < n - horizon; t += step) {
    const prefix = closed.slice(0, t + 1) // SOLO el pasado
    // Mismo pipeline multi-grado que la UI en vivo → la calibración mide los
    // MISMOS scores que verá el usuario (no un detector single-k distinto).
    const { scenarios } = detectScenariosMultiDegree(prefix, kList)
    // Mejor conteo CONFIRMADO con objetivo direccional limpio (impulso/diagonal
    // completados). Los triángulos proyectan a ambos lados (sin sesgo); las
    // correcciones ABC y las dobles W-X-Y completadas no llevan target propio
    // (su reanudación apunta al origen) → quedan fuera por el filtro `x.target`.
    const s = scenarios.find(
      (x) => !x.developing && x.target && x.pattern !== 'triangulo' && x.pattern !== 'wxy',
    )
    if (!s || !s.target) continue
    if (seen.has(s.id)) continue
    seen.add(s.id)
    evaluated++

    const entry = prefix[prefix.length - 1].close
    const future = closed.slice(t + 1, t + 1 + horizon) // SOLO el futuro
    const res = firstPassage(entry, s.target, s.invalidation.price, future)
    if (res) {
      const metKeys = s.confluence.factors.filter((f) => f.met).map((f) => f.key)
      outcomes.push({ score: s.score, hit: res.hit, bars: res.bars, metKeys })
    }
  }

  return { outcomes, resolved: outcomes.length, evaluated, step }
}
