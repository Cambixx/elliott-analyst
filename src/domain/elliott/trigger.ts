import type { Scenario } from './types'
import type { SrLevel, SrStrength } from './levels'
import { scenarioBias } from './opportunity'

/**
 * Nivel cuya ruptura convierte la tesis de ANTICIPADA en CONFIRMADA. No es un objetivo
 * ni una señal: es el precio al que el mercado deja de contradecir el conteo.
 */
export interface ConfirmationTrigger {
  price: number
  /** Qué es el nivel respecto al precio actual (arriba = resistencia, abajo = soporte). */
  kind: 'resistencia' | 'soporte'
  touches: number
  strength: SrStrength
  /** Distancia desde el precio actual, en % (lo que "cuesta" esperar a la confirmación). */
  distancePct: number
  /**
   * Conteos ALTERNATIVOS de sesgo contrario que quedarían invalidados al romper el nivel.
   * Es lo que hace valioso el disparador: un mismo movimiento confirma tu tesis y mata
   * la contraria a la vez.
   */
  invalidates: string[]
}

const PATTERN_LABEL: Record<Scenario['pattern'], string> = {
  impulso: 'Impulso',
  diagonal: 'Diagonal',
  zigzag: 'Zigzag',
  flat: 'Plana',
  triangulo: 'Triángulo',
  wxy: 'Doble W-X-Y',
}

/**
 * Busca el DISPARADOR DE CONFIRMACIÓN del conteo: el nivel de reacción (soporte/resistencia
 * ya tocado varias veces) más cercano en el sentido de la tesis, cuya ruptura deja de
 * contradecirla.
 *
 * Por qué importa: el plan de riesgo entra "a mercado" sobre una estructura que aún no ha
 * demostrado nada — es anticipación. Esperar a que el precio rompa este nivel cuesta precio
 * (peor entrada, R:R algo menor) pero cambia la naturaleza de la operación: el mercado ya se
 * ha movido a favor. La herramienta no decide por el usuario; le enseña el precio de esa
 * elección.
 *
 * No inventa niveles: usa los mismos S/R que ya se dibujan y se listan en el panel. Si el
 * conteo no tiene sesgo direccional (triángulo) o no hay ningún nivel por delante, devuelve
 * null en vez de forzar un número.
 */
export function confirmationTrigger(
  main: Scenario,
  price: number | null | undefined,
  levels: SrLevel[],
  alternatives: Scenario[] = [],
): ConfirmationTrigger | null {
  if (price == null || !Number.isFinite(price) || price <= 0) return null
  const bias = scenarioBias(main)
  if (bias === 'vigilar') return null
  const long = bias === 'compra'

  // Niveles POR DELANTE de la tesis: arriba si se opera al alza, abajo si a la baja.
  const ahead = levels.filter((l) =>
    Number.isFinite(l.price) && (long ? l.price > price : l.price < price),
  )
  if (ahead.length === 0) return null
  const lvl = ahead.reduce((best, l) =>
    Math.abs(l.price - price) < Math.abs(best.price - price) ? l : best,
  )

  // Conteos contrarios que la ruptura mataría: hoy siguen vivos (el precio no ha rebasado
  // su invalidación) pero el disparador queda al otro lado de ese nivel.
  const invalidates = alternatives
    .filter((o) => {
      if (o.id === main.id) return false
      const ob = scenarioBias(o)
      if (ob === 'vigilar' || ob === bias) return false
      const inv = o.invalidation.price
      if (!Number.isFinite(inv)) return false
      return long ? price <= inv && lvl.price >= inv : price >= inv && lvl.price <= inv
    })
    .map((o) => `${PATTERN_LABEL[o.pattern]} ${o.direction === 'up' ? 'alcista' : 'bajista'}`)

  return {
    price: lvl.price,
    kind: long ? 'resistencia' : 'soporte',
    touches: lvl.touches,
    strength: lvl.strength,
    distancePct: (Math.abs(lvl.price - price) / price) * 100,
    invalidates,
  }
}
