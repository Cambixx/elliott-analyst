import type { Scenario } from './types'

/** Ratios de Fibonacci de referencia para anotar la relación más cercana. */
const FIB_IDEALS = [0.236, 0.382, 0.5, 0.618, 0.786, 1.0, 1.272, 1.618, 2.0, 2.618]

export interface WaveRelation {
  label: string
  /** p.ej. "1.62 × onda 1" */
  value: string
  /** p.ej. "≈ 1.618" si está cerca de un ratio clave de Fibonacci. */
  fib?: string
}

function rel(label: string, num: number, den: number, ref: string): WaveRelation {
  const r = den ? num / den : NaN
  if (!Number.isFinite(r)) return { label, value: '—' }
  const nearest = FIB_IDEALS.reduce((a, b) => (Math.abs(b - r) < Math.abs(a - r) ? b : a))
  const fib = Math.abs(nearest - r) < 0.06 ? `≈ ${nearest}` : undefined
  return { label, value: `${r.toFixed(2)} × ${ref}`, fib }
}

/**
 * Relaciones de Fibonacci entre las ondas de un escenario (educativo).
 * Reutiliza los pivotes ya detectados; no recalcula nada del mercado.
 */
export function waveRelations(s: Scenario): WaveRelation[] {
  const p = s.pivots
  const len = (a: number, b: number) => Math.abs(p[b].price - p[a].price)

  if (s.kind === 'impulse') {
    // Impulso / diagonal: P0..P5
    const w1 = len(0, 1)
    const w3 = len(2, 3)
    return [
      rel('Onda 2', len(1, 2), w1, 'onda 1'),
      rel('Onda 3', w3, w1, 'onda 1'),
      rel('Onda 4', len(3, 4), w3, 'onda 3'),
      rel('Onda 5', len(4, 5), w1, 'onda 1'),
    ]
  }

  if (s.pattern === 'triangulo') {
    // Triángulo: P0..P5 (5 patas)
    const L = [len(0, 1), len(1, 2), len(2, 3), len(3, 4), len(4, 5)]
    return [
      rel('Onda C', L[2], L[0], 'onda A'),
      rel('Onda D', L[3], L[1], 'onda B'),
      rel('Onda E', L[4], L[2], 'onda C'),
    ]
  }

  if (s.pattern === 'wxy') {
    // Doble W-X-Y: P0..P7. W = P0..P3, X = P3→P4, Y = P4..P7.
    const w = len(0, 3)
    return [
      rel('Onda X', len(3, 4), w, 'onda W'),
      rel('Onda Y', len(4, 7), w, 'onda W'),
    ]
  }

  // Zigzag / plana: P0..P3
  const a = len(0, 1)
  return [rel('Onda B', len(1, 2), a, 'onda A'), rel('Onda C', len(2, 3), a, 'onda A')]
}
