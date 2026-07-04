import type { ScenarioPattern } from './elliott/types'
import type { PreTradeChecklist, TradeGrade } from './checklist'

export type TradeBias = 'compra' | 'venta'
export type TradeStatus = 'abierta' | 'ganada' | 'perdida' | 'breakeven' | 'cancelada'

/**
 * Una anotación del diario: la hipótesis que tomó el usuario (capturada del análisis)
 * + su desenlace. Cerrar el bucle hipótesis→resultado es lo que de verdad mejora a un
 * trader, y construye una calibración PERSONAL que complementa al backtest sintético.
 */
export interface JournalEntry {
  id: string
  createdAt: number
  symbol: string
  base: string
  timeframe: string
  pattern: ScenarioPattern
  bias: TradeBias
  developing: boolean
  /** Snapshot del plan en el momento de anotar. */
  entry: number
  stop: number
  target: number | null
  plannedRr: number | null
  /** Confianza del conteo al anotar (para análisis posterior). */
  confidence: string
  /**
   * Checklist de disciplina AUTO-RELLENADO y CONGELADO al guardar (5 flags + grado A/B/C).
   * Opcional/aditivo: las anotaciones anteriores no lo tienen. Es una foto de las
   * condiciones de entrada contra el sesgo retrospectivo, NO una validación del método.
   */
  checklist?: PreTradeChecklist
  /** Desenlace. */
  status: TradeStatus
  closedAt?: number
  exitPrice?: number | null
  /** R realizado (beneficio en múltiplos del riesgo); se calcula al cerrar. */
  realizedR?: number | null
}

/**
 * R realizado = beneficio / riesgo, en múltiplos del riesgo inicial. Positivo si la
 * operación ganó. null si el riesgo es nulo o faltan datos.
 */
export function computeRealizedR(
  entry: number,
  stop: number,
  exitPrice: number,
  bias: TradeBias,
): number | null {
  const risk = Math.abs(entry - stop)
  if (!(risk > 0) || !Number.isFinite(exitPrice)) return null
  const profit = bias === 'compra' ? exitPrice - entry : entry - exitPrice
  return profit / risk
}

export interface PatternStat {
  pattern: ScenarioPattern
  n: number
  wins: number
  winRate: number | null
}

export interface JournalStats {
  total: number
  open: number
  /** Operaciones con desenlace decidido (ganada o perdida). */
  decided: number
  wins: number
  losses: number
  /** wins / (wins + losses); null si no hay decididas. */
  winRate: number | null
  /** R:R medio PLANIFICADO de las anotadas (con plan). */
  avgPlannedRr: number | null
  /** Suma de R realizado de las operaciones cerradas con R. */
  realizedRSum: number | null
  /** Desglose por patrón (calibración personal por tipo de conteo). */
  byPattern: PatternStat[]
}

/** Muestra mínima por GRADO para mostrar una tasa (más estricta que la del backtest, a
 *  propósito: en un diario personal cada segmento tarda en acumular). */
export const MIN_GRADE_SAMPLE = 30

export interface GradeStat {
  grade: TradeGrade
  n: number
  decided: number
  wins: number
  /** wins/decided; null si decided < MIN_GRADE_SAMPLE (no se enseña con muestra corta). */
  winRate: number | null
  /** R realizado medio; null si < MIN_GRADE_SAMPLE decididas con R. */
  expectancyR: number | null
}

/**
 * Segmenta el historial por GRADO del checklist congelado: permite al usuario refutar (o
 * validar) sus propias condiciones de entrada con sus R. Ignora anotaciones sin checklist.
 * Solo devuelve tasas cuando hay ≥ MIN_GRADE_SAMPLE decididas (si no, winRate/expectancyR null).
 */
export function gradeStats(entries: JournalEntry[]): GradeStat[] {
  const grades: TradeGrade[] = ['A', 'B', 'C']
  return grades.map((grade) => {
    const of = entries.filter((e) => e.checklist?.grade === grade)
    const wins = of.filter((e) => e.status === 'ganada').length
    const losses = of.filter((e) => e.status === 'perdida').length
    const decided = wins + losses
    const rs = of.map((e) => e.realizedR).filter((r): r is number => r != null)
    // winRate se gatea por DECIDIDAS (su denominador); expectancyR por su PROPIA muestra
    // de R (rs.length): cerrar sin precio de salida deja realizedR null pero cuenta como
    // decidida, así que gatear expectancyR por `decided` mostraría una media de R sobre
    // pocas muestras.
    return {
      grade,
      n: of.length,
      decided,
      wins,
      winRate: decided >= MIN_GRADE_SAMPLE ? wins / decided : null,
      expectancyR: rs.length >= MIN_GRADE_SAMPLE ? rs.reduce((s, x) => s + x, 0) / rs.length : null,
    }
  })
}

const avg = (xs: number[]): number | null => (xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : null)

/** Estadísticas agregadas del diario: win rate, R medio y desglose por patrón. */
export function journalStats(entries: JournalEntry[]): JournalStats {
  const wins = entries.filter((e) => e.status === 'ganada').length
  const losses = entries.filter((e) => e.status === 'perdida').length
  const decided = wins + losses

  const plannedRrs = entries.map((e) => e.plannedRr).filter((r): r is number => r != null)
  const realizedRs = entries.map((e) => e.realizedR).filter((r): r is number => r != null)

  const patterns = [...new Set(entries.map((e) => e.pattern))]
  const byPattern: PatternStat[] = patterns
    .map((pattern) => {
      const ofP = entries.filter((e) => e.pattern === pattern)
      const w = ofP.filter((e) => e.status === 'ganada').length
      const l = ofP.filter((e) => e.status === 'perdida').length
      return { pattern, n: ofP.length, wins: w, winRate: w + l ? w / (w + l) : null }
    })
    .sort((a, b) => b.n - a.n)

  return {
    total: entries.length,
    open: entries.filter((e) => e.status === 'abierta').length,
    decided,
    wins,
    losses,
    winRate: decided ? wins / decided : null,
    avgPlannedRr: avg(plannedRrs),
    realizedRSum: realizedRs.length ? realizedRs.reduce((s, x) => s + x, 0) : null,
    byPattern,
  }
}
