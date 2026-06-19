import type { Bias } from '@/domain/elliott/opportunity'
import {
  annualizedFunding,
  classifyFunding,
  oiTrend,
  derivativesRead,
  type FundingLevel,
} from '@/domain/derivatives'
import { useNow } from '@/lib/useNow'
import { useDerivatives } from './useDerivatives'

const compactUsd = (n: number) =>
  '$' + new Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 2 }).format(n)

/** Color del badge según lo extremo del funding (los extremos avisan de masificación). */
const FUNDING_STYLE: Record<FundingLevel, string> = {
  'muy-positivo': 'border-amber-500/40 bg-amber-500/15 text-amber-300',
  positivo: 'border-slate-600 bg-slate-700/40 text-slate-300',
  neutral: 'border-slate-600 bg-slate-700/40 text-slate-300',
  negativo: 'border-slate-600 bg-slate-700/40 text-slate-300',
  'muy-negativo': 'border-amber-500/40 bg-amber-500/15 text-amber-300',
}

const FUNDING_LABEL: Record<FundingLevel, string> = {
  'muy-positivo': 'muy positivo',
  positivo: 'positivo',
  neutral: 'neutral',
  negativo: 'negativo',
  'muy-negativo': 'muy negativo',
}

const OI_ARROW = { subiendo: '▲', estable: '▬', bajando: '▼' } as const
const OI_COLOR = { subiendo: 'text-emerald-300', estable: 'text-slate-400', bajando: 'text-red-300' } as const

const ALIGN_STYLE = {
  refuerza: 'border-emerald-700/40 bg-emerald-950/20 text-emerald-200/90',
  cautela: 'border-amber-700/40 bg-amber-950/20 text-amber-200/90',
  neutral: 'border-slate-700/60 bg-slate-800/40 text-slate-400',
} as const

function countdown(ms: number): string {
  if (ms <= 0) return 'ahora'
  const h = Math.floor(ms / 3_600_000)
  const m = Math.floor((ms % 3_600_000) / 60_000)
  return h > 0 ? `${h}h ${m}m` : `${m}m`
}

/**
 * Contexto de DERIVADOS: funding rate y open interest del perpetuo USDT, con una
 * lectura en clave Elliott del posicionamiento frente al sesgo del conteo primario.
 * Es contexto de posicionamiento, no una señal: matiza la probabilidad del giro.
 */
export function DerivativesCard({ base, bias }: { base: string; bias: Bias }) {
  const { data, isError } = useDerivatives(base)
  const now = useNow(30_000)
  if (isError || !data) return null // sin perpetuo USDT → no se muestra

  const fundingOk = Number.isFinite(data.fundingRate)
  const level = classifyFunding(data.fundingRate)
  const annual = annualizedFunding(data.fundingRate)
  const oi = oiTrend(data.oiHistory)
  const read = derivativesRead(level, oi.trend, bias)
  const fundingPct = fundingOk ? (data.fundingRate * 100).toFixed(4) : null
  const oiAvailable = data.oiNotionalUsd != null && data.oiHistory.length > 0

  return (
    <div className="rounded-lg border border-slate-700 bg-slate-800/40 p-3">
      <div className="flex items-center gap-2">
        <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-300">
          Derivados · {data.perp}
        </span>
        <span className="ml-auto text-[10px] text-slate-500">
          próx. funding en {countdown(data.nextFundingTime - now)}
        </span>
      </div>

      <dl className="mt-2 grid grid-cols-2 gap-2 text-xs">
        <div>
          <dt className="text-slate-500">Funding (8h · anual)</dt>
          {fundingPct != null ? (
            <>
              <dd className="mt-0.5 flex items-center gap-1.5">
                <span className="font-mono text-slate-200">
                  {data.fundingRate >= 0 ? '+' : ''}
                  {fundingPct}%
                </span>
                <span className="text-[10px] text-slate-500">
                  ≈ {annual >= 0 ? '+' : ''}
                  {(annual * 100).toFixed(0)}%/año
                </span>
              </dd>
              <span
                className={'mt-1 inline-block rounded border px-1.5 py-0.5 text-[10px] font-bold uppercase ' + FUNDING_STYLE[level]}
              >
                {FUNDING_LABEL[level]}
              </span>
            </>
          ) : (
            <dd className="mt-0.5 font-mono text-slate-500">s/d</dd>
          )}
        </div>
        <div>
          <dt className="text-slate-500">Open interest</dt>
          {oiAvailable ? (
            <>
              <dd className="mt-0.5 font-mono text-slate-200">{compactUsd(data.oiNotionalUsd as number)}</dd>
              <span className={'mt-1 inline-block text-[10px] font-semibold ' + OI_COLOR[oi.trend]}>
                {OI_ARROW[oi.trend]} {oi.trend}
                {Math.abs(oi.changePct) >= 0.005 && (
                  <span className="ml-1 text-slate-500">
                    ({oi.changePct >= 0 ? '+' : ''}
                    {(oi.changePct * 100).toFixed(1)}% 24h)
                  </span>
                )}
              </span>
            </>
          ) : (
            <dd className="mt-0.5 font-mono text-slate-500">s/d</dd>
          )}
        </div>
      </dl>

      <p className={'mt-2 rounded border px-2 py-1 text-[11px] leading-relaxed ' + ALIGN_STYLE[read.alignment]}>
        {read.text}
      </p>
      <p className="mt-1 text-[10px] leading-snug text-slate-500">
        Contexto de posicionamiento, no una señal: matiza la probabilidad del escenario, no lo confirma ni lo invalida.
      </p>
    </div>
  )
}
