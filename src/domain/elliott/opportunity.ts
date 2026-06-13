import type { Confidence, Scenario } from './types'

export type Bias = 'compra' | 'venta' | 'vigilar'

/** Cuán exigente es el criterio para considerar algo "oportunidad" (nº de alertas). */
export type AlertLevel = 'estricto' | 'equilibrado' | 'amplio'

export interface Opportunity {
  bias: Bias
  reason: string
}

const CONF_RANK: Record<Confidence, number> = { baja: 0, media: 1, alta: 2 }

/**
 * Sesgo direccional honesto de un escenario (no es una orden):
 *  - Impulso completado → la tendencia se agota → posible giro (compra si era bajista, venta si alcista).
 *  - Diagonal final → reversión rápida → contraria a su dirección.
 *  - Impulso en desarrollo (onda 5) o triángulo → "vigilar" (aún sin definir).
 *  - Corrección ABC completándose → se reanuda la tendencia previa (contraria a la corrección).
 */
export function scenarioBias(s: Scenario): Bias {
  if (s.kind === 'impulse') {
    // Onda 5 en desarrollo → sin sesgo accionable todavía (también en diagonales:
    // apostar a la reversión antes de que la estructura se complete es prematuro).
    if (s.developing) return 'vigilar'
    if (s.pattern === 'diagonal') return s.direction === 'up' ? 'venta' : 'compra'
    return s.direction === 'up' ? 'venta' : 'compra'
  }
  if (s.pattern === 'triangulo') return 'vigilar'
  return s.direction === 'down' ? 'compra' : 'venta'
}

/**
 * Decide si un escenario es una "oportunidad de análisis" accionable AHORA,
 * según el nivel de exigencia elegido. Devuelve null si no merece un aviso.
 *
 *  - estricto:    solo confianza ALTA y, además, precio en zona de decisión.
 *  - equilibrado: confianza alta sola, o media + precio en zona de decisión.
 *  - amplio:      confianza media o alta en cualquier punto, o precio en zona.
 */
export function deriveOpportunity(
  s: Scenario,
  price: number,
  level: AlertLevel = 'equilibrado',
): Opportunity | null {
  let inTarget = !!s.target && price >= s.target.low && price <= s.target.high
  let targetReason = s.target ? `precio en ${s.target.label.toLowerCase()}` : ''
  if (s.pattern === 'triangulo') {
    // El objetivo del triángulo (±amplitud) CONTIENE la propia estructura, así
    // que "estar dentro" no significa nada. La zona de decisión real es la
    // RUPTURA: precio fuera del rango de los pivotes del triángulo.
    const prices = s.pivots.map((p) => p.price)
    inTarget = price > Math.max(...prices) || price < Math.min(...prices)
    targetReason = 'ruptura del triángulo'
  }
  const nearPct = level === 'estricto' ? 0.005 : level === 'amplio' ? 0.01 : 0.007
  const nearInvalidation = Math.abs(price - s.invalidation.price) / price < nearPct
  const inZone = inTarget || nearInvalidation
  const conf = s.confidence

  let fire = false
  if (level === 'estricto') {
    fire = conf === 'alta' && inZone
  } else if (level === 'amplio') {
    fire = CONF_RANK[conf] >= 1 || inZone
  } else {
    fire = conf === 'alta' || (conf === 'media' && inZone)
  }
  if (!fire) return null

  const reasons: string[] = []
  if (conf === 'alta') reasons.push('conteo de confluencia alta')
  else if (conf === 'media') reasons.push('conteo de confluencia media')
  if (inTarget && targetReason) reasons.push(targetReason)
  if (nearInvalidation) reasons.push('precio junto al nivel de invalidación')

  return { bias: scenarioBias(s), reason: reasons.join(' · ') }
}
