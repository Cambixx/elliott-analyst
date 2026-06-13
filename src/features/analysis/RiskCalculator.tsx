import type { Scenario } from '@/domain/elliott/types'
import { computeRiskPlan } from '@/domain/risk'
import { useRiskStore, RISK_PCT_OPTIONS } from '@/store/useRiskStore'
import { formatPrice } from '@/lib/format'

const fmtUsd = (n: number) =>
  n.toLocaleString('es-ES', { maximumFractionDigits: 2 }) + ' USDC'

function rrColor(rr: number): string {
  if (rr >= 2) return 'text-green-300'
  if (rr >= 1) return 'text-amber-300'
  return 'text-red-300'
}

/**
 * Calculadora de gestión de riesgo sobre el escenario primario:
 * stop = invalidación, objetivo = zona del escenario; calcula tamaño de
 * posición y R:R. Orientativa: nunca dice si entrar, dice si los números
 * tienen sentido.
 */
export function RiskCalculatorCard({
  scenario,
  price,
}: {
  scenario: Scenario | null
  price: number | null | undefined
}) {
  const { capital, riskPct, setCapital, setRiskPct } = useRiskStore()

  const plan =
    scenario && price != null ? computeRiskPlan(scenario, price, capital, riskPct) : null

  return (
    <div className="rounded-lg border border-slate-700 bg-slate-800/40 p-3">
      <div className="flex items-center gap-2">
        <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-300">
          Gestión de riesgo
        </span>
        {plan && (
          <span
            className={
              'ml-auto rounded border px-1.5 py-0.5 text-[10px] font-bold uppercase ' +
              (plan.bias === 'compra'
                ? 'border-green-500/30 bg-green-500/15 text-green-300'
                : 'border-red-500/30 bg-red-500/15 text-red-300')
            }
          >
            {plan.bias === 'compra' ? 'largo' : 'corto'}
          </span>
        )}
      </div>

      {/* Entradas del usuario */}
      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] text-slate-400">
        <label className="flex items-center gap-1">
          Capital
          <input
            type="number"
            min={0}
            value={capital}
            onChange={(e) => setCapital(Number(e.target.value))}
            className="w-20 rounded border border-slate-600 bg-slate-800 px-1 py-0.5 text-right font-mono text-slate-200 outline-none focus:border-cyan-500"
            aria-label="Capital de la cuenta en USDC"
          />
          USDC
        </label>
        <label className="flex items-center gap-1">
          Riesgo
          <select
            value={riskPct}
            onChange={(e) => setRiskPct(Number(e.target.value))}
            className="rounded border border-slate-600 bg-slate-800 px-1 py-0.5 text-slate-200 outline-none"
            aria-label="Porcentaje del capital arriesgado por operación"
          >
            {RISK_PCT_OPTIONS.map((p) => (
              <option key={p} value={p}>
                {p}%
              </option>
            ))}
          </select>
        </label>
      </div>

      {!plan ? (
        <p className="mt-2 text-[11px] leading-relaxed text-slate-500">
          {scenario
            ? 'Este escenario no tiene un sesgo direccional accionable ahora (o el precio ya superó la invalidación). La calculadora se activa con un escenario de compra o venta válido.'
            : 'Sin escenario detectado: no hay nada que calcular.'}
        </p>
      ) : (
        <>
          <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-[11px]">
            <div className="flex justify-between gap-2">
              <dt className="text-slate-500">Entrada</dt>
              <dd className="font-mono text-slate-300">{formatPrice(plan.entry)}</dd>
            </div>
            <div className="flex justify-between gap-2">
              <dt className="text-slate-500">Stop ({plan.stopLabel})</dt>
              <dd className="font-mono text-red-200">
                {formatPrice(plan.stop)}{' '}
                <span className="text-slate-500">(-{(plan.stopDistPct * 100).toFixed(2)}%)</span>
              </dd>
            </div>
            <div className="flex justify-between gap-2">
              <dt className="text-slate-500">Objetivo conserv.</dt>
              <dd className="font-mono text-cyan-200">
                {plan.targetNear != null ? formatPrice(plan.targetNear) : '—'}
              </dd>
            </div>
            <div className="flex justify-between gap-2">
              <dt className="text-slate-500">R:R</dt>
              <dd className={'font-mono font-semibold ' + (plan.rr != null ? rrColor(plan.rr) : 'text-slate-500')}>
                {plan.rr != null ? `1 : ${plan.rr.toFixed(2)}` : '—'}
              </dd>
            </div>
            <div className="flex justify-between gap-2">
              <dt className="text-slate-500">Riesgo máx.</dt>
              <dd className="font-mono text-slate-300">{fmtUsd(plan.riskAmount)}</dd>
            </div>
            <div className="flex justify-between gap-2">
              <dt className="text-slate-500">Posición</dt>
              <dd className="font-mono text-slate-200">
                {fmtUsd(plan.positionNotional)}
              </dd>
            </div>
          </dl>

          {plan.warnings.length > 0 && (
            <ul className="mt-2 list-inside list-disc text-[10px] text-amber-200/80">
              {plan.warnings.map((w, i) => (
                <li key={i}>{w}</li>
              ))}
            </ul>
          )}

          <p className="mt-2 text-[10px] leading-relaxed text-slate-600">
            Cálculo orientativo derivado del conteo primario. No es asesoramiento: el stop puede
            saltar con slippage y el objetivo puede no alcanzarse.
          </p>
        </>
      )}
    </div>
  )
}
