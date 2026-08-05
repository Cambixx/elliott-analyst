import type { Scenario } from './elliott/types'
import { scenarioBias, type Bias } from './elliott/opportunity'

/**
 * Plan de riesgo orientativo derivado de un escenario de Elliott:
 * stop = nivel de invalidación, objetivo = zona del escenario, y a partir del
 * capital y % de riesgo del usuario, el tamaño de posición que mantiene la
 * pérdida máxima acotada si salta el stop. NO es asesoramiento ni una señal.
 */
export interface RiskPlan {
  bias: Exclude<Bias, 'vigilar'>
  entry: number
  /** Stop EFECTIVO: el nivel estructural más el colchón de ATR, si se ha pedido. */
  stop: number
  /** De dónde sale el stop: invalidación del impulso o extremo de la corrección. */
  stopLabel: string
  /**
   * Nivel estructural del stop SIN colchón (invalidación / extremo de la corrección).
   * Se conserva aparte para poder mostrar ambos: el nivel que define la tesis y el
   * precio donde realmente se sale.
   */
  stopLevel: number
  /** Colchón aplicado en unidades de precio (0 si está desactivado). */
  stopBuffer: number
  /** Múltiplo de ATR usado para el colchón (0 = stop pegado al nivel). */
  stopBufferAtr: number
  /** Objetivo conservador (el borde de la zona más cercano a la entrada). */
  targetNear: number | null
  targetFar: number | null
  /**
   * De dónde sale el objetivo. Necesario porque una corrección COMPLETADA no tiene zona
   * objetivo propia y el plan usa el origen de la corrección: sin decirlo, el informe
   * mostraba un precio "de la nada" y parecía tomado de otro conteo.
   */
  targetLabel: string | null
  /** Pérdida máxima si salta el stop (capital × riesgo%). */
  riskAmount: number
  /** Distancia al stop en % de la entrada. */
  stopDistPct: number
  /** Tamaño de la posición en USDC que respeta el riesgo máximo. */
  positionNotional: number
  /** Unidades del activo base equivalentes. */
  positionUnits: number
  /** Relación beneficio/riesgo usando el objetivo conservador. */
  rr: number | null
  /** positionNotional / capital (>1 ⇒ requeriría apalancamiento). */
  leverage: number
  warnings: string[]
}

/** Múltiplos de ATR ofrecidos como colchón del stop (0 = pegado al nivel, como antes). */
export const STOP_BUFFER_OPTIONS = [0, 0.25, 0.5, 1] as const

export function computeRiskPlan(
  scenario: Scenario,
  price: number,
  capital: number,
  riskPct: number,
  /**
   * Colchón del stop: se aleja el stop del nivel estructural `bufferAtr × atr`, SIEMPRE
   * en dirección contraria a la entrada. Motivo: el nivel de invalidación suele coincidir
   * con un soporte/resistencia muy tocado, que es justo donde el precio barre mechas antes
   * de girar; un stop pegado al nivel salta por ruido sin que la tesis se haya roto. El
   * precio es un R:R algo peor, por eso es una ELECCIÓN del usuario y por defecto va a 0.
   */
  opts?: { atr?: number | null; bufferAtr?: number },
): RiskPlan | null {
  const bias = scenarioBias(scenario)
  if (bias === 'vigilar') return null
  if (!Number.isFinite(price) || price <= 0 || capital <= 0 || riskPct <= 0) return null

  const long = bias === 'compra'

  // Stop según el tipo de operativa:
  //  - EN DESARROLLO (continuación hacia el objetivo): la invalidación de la onda
  //    en curso es el stop natural (perder ese nivel mata el pronóstico).
  //  - Impulso/diagonal COMPLETADO: la invalidación (más allá de la onda 5) ya es
  //    el stop natural del trade contrario.
  //  - Corrección COMPLETADA (zigzag/flat): el stop del trade de reanudación es el
  //    extremo de la onda C — si el precio lo supera, la corrección sigue.
  let stop: number
  let stopLabel: string
  if (scenario.developing) {
    // Continuación: el stop es la invalidación de la onda en curso, que el motor
    // ya fija en el extremo de la onda previa (onda 4 en un impulso, onda B en una
    // corrección…). Coincide con la línea de invalidación del gráfico y con la
    // pista de backtest → mismo nivel en todas las superficies.
    stop = scenario.invalidation.price
    stopLabel = 'invalidación de la onda en curso'
  } else if (scenario.kind === 'impulse') {
    stop = scenario.invalidation.price
    stopLabel = 'invalidación'
  } else {
    stop = scenario.pivots[scenario.pivots.length - 1].price
    stopLabel = 'extremo de la corrección'
  }

  // Colchón de ATR: aleja el stop del nivel estructural (hacia abajo en largo, hacia
  // arriba en corto) para que una mecha sobre el propio nivel no cierre la operación.
  const stopLevel = stop
  const atr = opts?.atr
  const bufferAtr = opts?.bufferAtr ?? 0
  const stopBuffer =
    bufferAtr > 0 && atr != null && Number.isFinite(atr) && atr > 0 ? bufferAtr * atr : 0
  stop = long ? stopLevel - stopBuffer : stopLevel + stopBuffer

  // El stop debe quedar al lado correcto de la entrada (debajo en largo, encima en corto).
  const stopDist = long ? price - stop : stop - price
  if (stopDist <= 0) return null

  const warnings: string[] = []
  const stopDistPct = stopDist / price
  const riskAmount = capital * (riskPct / 100)
  const positionNotional = riskAmount / stopDistPct
  const positionUnits = positionNotional / price
  const leverage = positionNotional / capital

  // Objetivo conservador: el borde de la zona más cercano a la entrada.
  // Para correcciones sin zona propia, el imán natural al reanudarse la
  // tendencia es el origen de la corrección.
  let targetNear: number | null = null
  let targetFar: number | null = null
  let targetLabel: string | null = null
  if (scenario.target) {
    targetNear = long ? scenario.target.low : scenario.target.high
    targetFar = long ? scenario.target.high : scenario.target.low
    targetLabel = scenario.target.label
  } else if (scenario.kind === 'correction') {
    targetNear = scenario.pivots[0].price
    targetLabel = 'origen de la corrección — imán al reanudarse la tendencia'
  }
  if (targetNear != null && targetNear <= 0) {
    // Precio imposible (zona degenerada en pares baratos): no es un objetivo válido.
    targetNear = null
    targetFar = null
    targetLabel = null
  }
  if (targetNear != null) {
    const rewardDist = long ? targetNear - price : price - targetNear
    if (rewardDist <= 0) {
      warnings.push('El precio ya está dentro o más allá de la zona objetivo.')
      targetNear = null
      targetFar = null
      targetLabel = null
    }
  }

  const rr =
    targetNear != null ? Math.abs(targetNear - price) / stopDist : null

  if (rr != null && rr < 1) {
    warnings.push('R:R menor que 1: arriesgas más de lo que puedes ganar hasta el objetivo conservador.')
  }
  if (leverage > 1) {
    warnings.push(
      `El tamaño calculado (${Math.round(positionNotional)} USDC) supera tu capital: requeriría apalancamiento ×${leverage.toFixed(1)}.`,
    )
  }
  if (stopDistPct < 0.005) {
    warnings.push('Stop muy cercano (<0,5%): el ruido del mercado puede sacarte de la posición.')
  }

  return {
    bias,
    entry: price,
    stop,
    stopLabel,
    stopLevel,
    stopBuffer,
    stopBufferAtr: stopBuffer > 0 ? bufferAtr : 0,
    targetNear,
    targetFar,
    targetLabel,
    riskAmount,
    stopDistPct,
    positionNotional,
    positionUnits,
    rr,
    leverage,
    warnings,
  }
}
