import type { Outcome } from './backtest'

export interface Bucket {
  label: 'baja' | 'media' | 'alta'
  min: number
  max: number
  n: number
  hits: number
  /** Tasa de acierto (objetivo antes que invalidación); null si n=0. */
  hitRate: number | null
}

export interface FactorStat {
  key: string
  /** Conteos confirmados en los que el factor estaba cumplido. */
  metN: number
  /** Tasa de acierto observada cuando el factor estaba cumplido. */
  hitRateWhenMet: number
  /** Diferencia respecto a la tasa base (positivo = el factor acompaña a más aciertos). */
  lift: number
}

export interface Calibration {
  total: number
  hits: number
  hitRate: number | null
  buckets: Bucket[]
  /** Lift observado por factor de confluencia (transparencia, NO se usa para repesar). */
  factorStats: FactorStat[]
}

/** Mismos cortes que confidenceOf (45/65), para mapear score→banda de forma coherente. */
const BANDS: { label: Bucket['label']; min: number; max: number }[] = [
  { label: 'baja', min: 0, max: 45 },
  { label: 'media', min: 45, max: 65 },
  { label: 'alta', min: 65, max: 101 },
]

/** Agrupa los desenlaces del backtest en bandas de score y calcula la tasa de acierto. */
export function calibrate(outcomes: Outcome[]): Calibration {
  const buckets: Bucket[] = BANDS.map((b) => ({ ...b, n: 0, hits: 0, hitRate: null }))
  let hits = 0
  for (const o of outcomes) {
    const b = buckets.find((x) => o.score >= x.min && o.score < x.max) ?? buckets[buckets.length - 1]
    b.n++
    if (o.hit) {
      b.hits++
      hits++
    }
  }
  for (const b of buckets) b.hitRate = b.n ? b.hits / b.n : null
  const total = outcomes.length
  const baseRate = total ? hits / total : 0

  // Lift por factor: tasa de acierto cuando el factor estaba cumplido vs la base.
  // Es transparencia (dato observado con su N), NO se usa para repesar el score
  // (con muestras pequeñas sería ruido; ver decisión de diseño).
  const metN = new Map<string, number>()
  const metHits = new Map<string, number>()
  for (const o of outcomes) {
    for (const key of o.metKeys) {
      metN.set(key, (metN.get(key) ?? 0) + 1)
      if (o.hit) metHits.set(key, (metHits.get(key) ?? 0) + 1)
    }
  }
  const factorStats: FactorStat[] = [...metN.entries()]
    .map(([key, n]) => {
      const hitRateWhenMet = (metHits.get(key) ?? 0) / n
      return { key, metN: n, hitRateWhenMet, lift: hitRateWhenMet - baseRate }
    })
    .sort((a, b) => b.metN - a.metN)

  return { total, hits, hitRate: total ? hits / total : null, buckets, factorStats }
}

export interface Likelihood {
  /** Término cualitativo honesto (sin porcentaje puntual ni "probable" a secas). */
  term: string
  /** true si hay muestra histórica suficiente para respaldar una frecuencia. */
  calibrated: boolean
  /** Frecuencia observada en la banda: "hits de total" (solo si calibrated). */
  frequency: { hits: number; total: number } | null
}

/** Muestra mínima por banda para mostrar una frecuencia en vez de solo el término. */
export const MIN_CALIBRATION_SAMPLE = 8

/**
 * Traduce un score interno a lenguaje de incertidumbre HONESTO. Si hay histórico
 * suficiente en la banda del score, acompaña con la frecuencia observada
 * ("alcanzó su objetivo X de N veces"); si no, solo el término cualitativo.
 * Nunca devuelve un porcentaje puntual ni la palabra "probable" a secas.
 */
export function scoreToLikelihood(score: number, cal?: Calibration | null): Likelihood {
  const term =
    score >= 65
      ? 'señales fuertes a favor del conteo'
      : score >= 45
        ? 'señales mixtas'
        : 'señales débiles'

  const bucket = cal?.buckets.find((b) => score >= b.min && score < b.max)
  if (bucket && bucket.n >= MIN_CALIBRATION_SAMPLE) {
    return { term, calibrated: true, frequency: { hits: bucket.hits, total: bucket.n } }
  }
  return { term, calibrated: false, frequency: null }
}
