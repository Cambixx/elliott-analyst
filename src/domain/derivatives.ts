import type { OiPoint } from '@/api/binance-futures'
import type { Bias } from './elliott/opportunity'

export type FundingLevel = 'muy-negativo' | 'negativo' | 'neutral' | 'positivo' | 'muy-positivo'
export type OiTrend = 'subiendo' | 'estable' | 'bajando'

/** Funding cobrado 3 veces al día → anualizado ≈ rate × 3 × 365. */
export function annualizedFunding(rate8h: number): number {
  return rate8h * 3 * 365
}

/**
 * Clasifica el funding rate (fracción por 8h). Positivo = los largos pagan a los
 * cortos (sesgo alcista masificado); negativo = al revés. Los extremos señalan
 * posicionamiento masificado y riesgo de purga/squeeze.
 */
export function classifyFunding(rate8h: number): FundingLevel {
  if (rate8h >= 0.0005) return 'muy-positivo' // ≳ +0,05%/8h (~+55% anual)
  if (rate8h >= 0.0001) return 'positivo'
  if (rate8h <= -0.0005) return 'muy-negativo'
  if (rate8h <= -0.0001) return 'negativo'
  return 'neutral'
}

/**
 * Tendencia del open interest comparando el valor actual con ~24h antes (6 velas
 * de 4h). OI al alza = entra dinero nuevo / más apalancamiento; a la baja = cierre
 * de posiciones / desapalancamiento. Umbral ±3% para no marcar ruido.
 */
export function oiTrend(history: OiPoint[]): { trend: OiTrend; changePct: number } {
  if (history.length < 7) return { trend: 'estable', changePct: 0 }
  const last = history[history.length - 1].value
  const ref = history[history.length - 7].value // ~24h antes
  if (!(ref > 0)) return { trend: 'estable', changePct: 0 }
  const changePct = (last - ref) / ref
  const trend: OiTrend = changePct >= 0.03 ? 'subiendo' : changePct <= -0.03 ? 'bajando' : 'estable'
  return { trend, changePct }
}

export interface DerivativesRead {
  /** ¿El posicionamiento refuerza el sesgo del conteo, pide cautela, o es neutral? */
  alignment: 'refuerza' | 'cautela' | 'neutral'
  text: string
}

const FUNDING_PHRASE: Record<FundingLevel, string> = {
  'muy-positivo': 'funding muy positivo (largos masificados)',
  positivo: 'funding positivo (sesgo alcista)',
  neutral: 'funding neutral (posicionamiento equilibrado)',
  negativo: 'funding negativo (sesgo bajista)',
  'muy-negativo': 'funding muy negativo (cortos masificados)',
}

const OI_PHRASE: Record<OiTrend, string> = {
  subiendo: 'open interest al alza (entra apalancamiento)',
  estable: 'open interest estable',
  bajando: 'open interest a la baja (desapalancamiento)',
}

/**
 * Lectura del posicionamiento de derivados EN CLAVE ELLIOTT, relacionándolo con el
 * sesgo del conteo primario. El texto es DIRECCIONAL (sirve igual para un giro de
 * onda completada que para la continuación de una onda en desarrollo): un extremo de
 * funding A FAVOR de la dirección esperada refuerza la tesis (posicionamiento contrario
 * atrapado); EN CONTRA, avisa de un posible squeeze previo. No es una señal: matiza.
 */
export function derivativesRead(
  funding: FundingLevel,
  oi: OiTrend,
  bias: Bias,
): DerivativesRead {
  const ctx = `${FUNDING_PHRASE[funding]}; ${OI_PHRASE[oi]}.`

  if (bias === 'venta') {
    // Sesgo bajista esperado (giro de onda completada o continuación a la baja).
    if (funding === 'muy-positivo')
      return {
        alignment: 'refuerza',
        text: `${ctx} Largos muy masificados: posicionamiento vulnerable a una purga que alimentaría la caída esperada${oi === 'subiendo' ? ' (el OI al alza añade combustible)' : ''}.`,
      }
    if (funding === 'muy-negativo')
      return {
        alignment: 'cautela',
        text: `${ctx} Pero los cortos muy masificados pueden provocar un short squeeze al alza antes: cautela con el timing del movimiento bajista.`,
      }
    return { alignment: 'neutral', text: ctx }
  }

  if (bias === 'compra') {
    // Sesgo alcista esperado (giro de onda completada o continuación al alza).
    if (funding === 'muy-negativo')
      return {
        alignment: 'refuerza',
        text: `${ctx} Cortos muy masificados: combustible para la subida esperada (riesgo de short squeeze al alza a favor del sesgo).`,
      }
    if (funding === 'muy-positivo')
      return {
        alignment: 'cautela',
        text: `${ctx} Pero los largos muy masificados restan combustible a la subida esperada y aumentan el riesgo de purga de largos: cautela.`,
      }
    return { alignment: 'neutral', text: ctx }
  }

  return { alignment: 'neutral', text: ctx }
}
