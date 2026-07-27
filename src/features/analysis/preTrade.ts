import type { Scenario } from '@/domain/elliott/types'
import type { RiskPlan } from '@/domain/risk'
import type { Bias } from '@/domain/indicators/trend'
import { buildPreTradeChecklist, type PreTradeChecklist } from '@/domain/checklist'
import { alignmentWithBias } from './useHigherTimeframe'

/**
 * Arma el checklist pre-entrada a partir del escenario y su plan de riesgo. FUENTE ÚNICA:
 * lo usan tanto la calculadora (que además lo congela al guardar en el diario) como el
 * informe de situación, para que ambos muestren SIEMPRE el mismo grado. El factor VSA es
 * el del giro ('vol' en motrices, 'volB' en correctivas).
 */
export function buildChecklistFor(
  scenario: Scenario | null | undefined,
  plan: RiskPlan | null | undefined,
  higherBias?: Bias,
  derivsAlignment?: 'refuerza' | 'cautela' | 'neutral' | null,
): PreTradeChecklist | null {
  if (!scenario || !plan) return null
  const vsaFactor = scenario.confluence.factors.find((f) => f.key === 'vol' || f.key === 'volB')
  return buildPreTradeChecklist({
    align: higherBias ? alignmentWithBias(scenario.direction, higherBias) : 'neutral',
    confidence: scenario.confidence,
    score: scenario.score,
    vsaMet: vsaFactor ? vsaFactor.met : null,
    derivs: derivsAlignment ?? null,
    rr: plan.rr,
  })
}
