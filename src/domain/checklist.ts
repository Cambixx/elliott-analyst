import type { Confidence } from './elliott/types'
import { scoreToLikelihood } from './elliott/calibration'

export type FlagStatus = 'ok' | 'warn' | 'against' | 'na'
export type TradeGrade = 'A' | 'B' | 'C'
export type FlagKey = 'align' | 'confidence' | 'vsa' | 'derivs' | 'rr'

export interface ChecklistFlag {
  key: FlagKey
  status: FlagStatus
  detail: string
}

export interface PreTradeChecklist {
  grade: TradeGrade
  flags: ChecklistFlag[]
}

/** Snapshot de las condiciones al guardar (todo deriva de velas ya cerradas → sin look-ahead). */
export interface ChecklistInput {
  align: 'favor' | 'contra' | 'neutral'
  confidence: Confidence
  score: number
  /** .met del factor VSA del giro ('vol'/'volB'); null si no aplica/legible. */
  vsaMet: boolean | null
  /** Lectura de derivados frente al escenario; null si no hay perpetuo. */
  derivs: 'refuerza' | 'cautela' | 'neutral' | null
  /** R:R del plan de riesgo; null si no hay objetivo válido. */
  rr: number | null
}

// --- Umbrales de POLÍTICA (no ajustados a datos) --------------------------------------
/** A exige ≥4 verdes (de 5) y 0 rojos → un grado A es raro y significativo. */
const GRADE_A_MIN_GREENS = 4
/** ≥2 condiciones en contra → C. */
const GRADE_C_MAX_REDS = 2

/**
 * Construye el checklist pre-trade (5 flags auto-rellenados) y deriva un GRADO A/B/C.
 * NO es una probabilidad ni una validación del método: es una foto de la disciplina de
 * entrada contra el sesgo retrospectivo. No introduce cortes propios — mapea salidas ya
 * calculadas (marco superior, confianza, VSA, derivados, R:R) a ok/warn/against/na.
 */
export function buildPreTradeChecklist(i: ChecklistInput): PreTradeChecklist {
  const flags: ChecklistFlag[] = []

  // 1) Alineación con el marco superior.
  flags.push({
    key: 'align',
    status: i.align === 'favor' ? 'ok' : i.align === 'contra' ? 'against' : 'warn',
    detail:
      i.align === 'favor'
        ? 'A favor del marco superior'
        : i.align === 'contra'
          ? 'En contra del marco superior'
          : 'Marco superior sin tendencia clara',
  })

  // 2) Confianza del conteo (con su término cualitativo, sin % puntual).
  flags.push({
    key: 'confidence',
    status: i.confidence === 'alta' ? 'ok' : i.confidence === 'media' ? 'warn' : 'against',
    detail: `Confianza ${i.confidence} · ${scoreToLikelihood(i.score, null).term}`,
  })

  // 3) VSA en el giro (ausencia de confirmación es neutral, no en contra).
  flags.push({
    key: 'vsa',
    status: i.vsaMet == null ? 'na' : i.vsaMet ? 'ok' : 'warn',
    detail: i.vsaMet == null ? 'Sin lectura VSA del giro' : i.vsaMet ? 'Clímax/absorción VSA presente' : 'Sin firma VSA de giro',
  })

  // 4) Posicionamiento de derivados frente al escenario.
  flags.push({
    key: 'derivs',
    status: i.derivs == null ? 'na' : i.derivs === 'refuerza' ? 'ok' : i.derivs === 'cautela' ? 'against' : 'warn',
    detail:
      i.derivs == null
        ? 'Sin perpetuo / sin datos de derivados'
        : i.derivs === 'refuerza'
          ? 'Derivados refuerzan el escenario'
          : i.derivs === 'cautela'
            ? 'Derivados: cautela (posible squeeze previo)'
            : 'Derivados neutrales',
  })

  // 5) R:R del plan (los cortes 2/1 coinciden con rrColor de la calculadora).
  const rrStatus: FlagStatus = i.rr == null || i.rr < 1 ? 'against' : i.rr >= 2 ? 'ok' : 'warn'
  flags.push({
    key: 'rr',
    status: rrStatus,
    detail: i.rr == null ? 'Sin objetivo válido (R:R indefinido)' : `R:R 1:${i.rr.toFixed(2)}`,
  })

  // GRADO sobre los flags aplicables (status !== 'na'). Un R:R en contra CAPA a C aunque
  // el resto sea verde. Con derivs 'na' el máximo de verdes es 4 → A sigue alcanzable sin
  // perpetuo. Un único rojo aislado baja de A a B, no fuerza C.
  const greens = flags.filter((f) => f.status === 'ok').length
  const reds = flags.filter((f) => f.status === 'against').length
  const rrAgainst = flags.find((f) => f.key === 'rr')!.status === 'against'
  const grade: TradeGrade =
    rrAgainst || reds >= GRADE_C_MAX_REDS ? 'C' : reds === 0 && greens >= GRADE_A_MIN_GREENS ? 'A' : 'B'

  return { grade, flags }
}
