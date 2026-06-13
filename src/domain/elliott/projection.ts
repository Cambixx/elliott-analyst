import type { Scenario } from './types'

/**
 * Objetivos hacia los que proyectar visualmente un escenario (hipótesis, no
 * predicción): los bordes de su zona objetivo si la tiene (impulso, diagonal,
 * triángulo — en triángulos eso significa ruptura en ambas direcciones), o el
 * origen de la corrección (el imán al reanudarse la tendencia) si no la tiene.
 * Filtra valores no positivos (sin sentido como precio).
 */
export function projectionTargets(s: Scenario): number[] {
  if (s.target) {
    return [s.target.high, s.target.low].filter((v) => v > 0)
  }
  if (s.kind === 'correction') {
    return [s.pivots[0].price].filter((v) => v > 0)
  }
  return []
}
