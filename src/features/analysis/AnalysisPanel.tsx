import type { ReactNode } from 'react'
import type { Confidence, Scenario, ScenarioPattern } from '@/domain/elliott/types'
import type { Bias } from '@/domain/indicators/trend'
import type { FibZone } from '@/domain/elliott/fibZone'
import type { AnchoredVwap } from '@/domain/vwap'
import type { WaveForecast } from '@/domain/elliott/forecast'
import { classifyLevel, type SrLevel } from '@/domain/elliott/levels'
import { waveRelations } from '@/domain/elliott/relations'
import { scenarioBias, type Bias as TradeBias } from '@/domain/elliott/opportunity'
import {
  scoreToLikelihood,
  MIN_CALIBRATION_SAMPLE,
  type Calibration,
} from '@/domain/elliott/calibration'
import { weightedMetPct } from '@/domain/elliott/confluence'

/** Etiquetas cortas de los factores de confluencia (para el panel de transparencia). */
const FACTOR_LABEL: Record<string, string> = {
  estructura: 'Estructura válida',
  macd3: 'Pico MACD en onda 3',
  div5: 'Divergencia RSI onda 5',
  rsi3: 'RSI sano en onda 3',
  fib24: 'Fibonacci ondas 2 y 4',
  fibExt: 'Extensión Fibonacci 3/5',
  vol: 'Volumen máx. onda 3',
  ema: 'EMAs alineadas',
  canal: 'Contenido en canal',
  subondas: 'Subondas coherentes',
  volB: 'Volumen B < A',
  rsiC: 'RSI extremo al final de C',
}
import { alignmentWithBias, type HigherContext } from './useHigherTimeframe'
import type { BacktestInsight } from './useBacktest'
import { MarketContextCard } from '@/features/market-context/MarketContext'
import { DerivativesCard } from '@/features/derivatives/DerivativesCard'
import { RiskCalculatorCard } from './RiskCalculator'

const fmt = (n: number) => n.toLocaleString('es-ES', { maximumFractionDigits: 8 })
/** Formato adaptativo: pocos decimales para precios altos, más para monedas baratas. */
const fmtZone = (n: number) =>
  n.toLocaleString('es-ES', { maximumFractionDigits: Math.abs(n) < 1 ? 6 : 2 })

const CONFIDENCE_STYLE: Record<Confidence, string> = {
  alta: 'bg-green-500/15 text-green-300 border-green-500/30',
  media: 'bg-amber-500/15 text-amber-300 border-amber-500/30',
  baja: 'bg-slate-500/15 text-slate-300 border-slate-500/30',
}

const PATTERN_META: Record<ScenarioPattern, { label: string; accent: string; badge: string }> = {
  impulso: { label: 'Impulso', accent: 'text-cyan-300', badge: 'bg-cyan-500/15 text-cyan-300 border-cyan-500/30' },
  diagonal: { label: 'Diagonal', accent: 'text-teal-300', badge: 'bg-teal-500/15 text-teal-300 border-teal-500/30' },
  zigzag: { label: 'Zigzag', accent: 'text-amber-300', badge: 'bg-amber-500/15 text-amber-300 border-amber-500/30' },
  flat: { label: 'Plana', accent: 'text-orange-300', badge: 'bg-orange-500/15 text-orange-300 border-orange-500/30' },
  triangulo: { label: 'Triángulo', accent: 'text-violet-300', badge: 'bg-violet-500/15 text-violet-300 border-violet-500/30' },
  wxy: { label: 'Doble W-X-Y', accent: 'text-amber-300', badge: 'bg-amber-500/15 text-amber-300 border-amber-500/30' },
}

/** Badge del sesgo operativo que sugiere el escenario (no es una orden). */
const TRADE_BIAS_BADGE: Record<TradeBias, { label: string; cls: string; title: string }> = {
  compra: {
    label: '▲ compra',
    cls: 'border-green-500/30 bg-green-500/15 text-green-300',
    title: 'El escenario sugiere una posible subida al completarse (no es una señal)',
  },
  venta: {
    label: '▼ venta',
    cls: 'border-red-500/30 bg-red-500/15 text-red-300',
    title: 'El escenario sugiere una posible bajada al completarse (no es una señal)',
  },
  vigilar: {
    label: '⏸ vigilar',
    cls: 'border-amber-500/30 bg-amber-500/15 text-amber-300',
    title: 'Estructura aún sin sesgo direccional claro: esperar confirmación',
  },
}

const BIAS_STYLE: Record<Bias, string> = {
  alcista: 'bg-green-500/15 text-green-300 border-green-500/30',
  bajista: 'bg-red-500/15 text-red-300 border-red-500/30',
  mixto: 'bg-slate-500/15 text-slate-300 border-slate-500/30',
}

function HigherContextCard({ ctx }: { ctx: HigherContext }) {
  return (
    <div className="rounded-lg border border-slate-700 bg-slate-800/40 p-3">
      <div className="flex items-center gap-2">
        <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-300">
          Marco superior · {ctx.timeframe}
        </span>
        <span
          className={
            'ml-auto rounded border px-1.5 py-0.5 text-[10px] font-bold uppercase ' +
            BIAS_STYLE[ctx.bias]
          }
        >
          {ctx.bias}
        </span>
      </div>
      <p className="mt-1 text-[11px] leading-relaxed text-slate-400">
        {ctx.isLoading
          ? 'Cargando contexto del marco superior…'
          : ctx.scenario
            ? `Conteo dominante: ${ctx.scenario.title} (${ctx.scenario.confidence}).`
            : 'Sin estructura de Elliott clara en el marco superior; se usa la tendencia por EMAs.'}
      </p>
    </div>
  )
}

function FibZoneCard({ zone }: { zone: FibZone }) {
  const broken = zone.broken
  return (
    <div className="rounded-lg border border-slate-700 bg-slate-800/40 p-3">
      <div className="flex items-center gap-2">
        <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-300">
          Zona de retroceso · Fibonacci
        </span>
        <span
          className={
            'ml-auto rounded border px-1.5 py-0.5 text-[10px] font-bold uppercase ' +
            (broken
              ? 'border-red-500/30 bg-red-500/15 text-red-300'
              : 'border-green-500/30 bg-green-500/15 text-green-300')
          }
        >
          {broken ? 'rota' : 'intacta'}
        </span>
      </div>
      <p className="mt-1 text-[11px] leading-relaxed text-slate-400">
        Banda dorada{' '}
        <span className="font-mono text-slate-300">
          {fmtZone(zone.bandLow)}–{fmtZone(zone.bandHigh)}
        </span>{' '}
        (retroceso 0.382–0.618 del impulso): zona donde suele terminar la corrección y buscar
        reacción. <span className="text-green-300">Verde</span> = intacta;{' '}
        <span className="text-red-300">roja</span> = el precio superó el 0.786 y el conteo del
        impulso pierde fuerza.
      </p>
    </div>
  )
}

function ScenarioCard({
  scenario,
  primary,
  bias,
  focused,
  calibration,
  lastPrice,
  onSelect,
}: {
  scenario: Scenario
  primary: boolean
  bias: Bias
  focused: boolean
  calibration?: Calibration | null
  lastPrice?: number | null
  onSelect?: (id: string) => void
}) {
  const meta = PATTERN_META[scenario.pattern]
  const accent = meta.accent
  const align = alignmentWithBias(scenario.direction, bias)
  const relations = waveRelations(scenario)
  const tradeBias = scenarioBias(scenario)
  const likelihood = scoreToLikelihood(scenario.score, calibration)
  // Solo las ondas motrices (impulso/diagonal) proyectan un objetivo hacia delante
  // comparable con el backtest; las correcciones completadas no tienen objetivo pendiente.
  const projectsTarget = scenario.pattern === 'impulso' || scenario.pattern === 'diagonal'
  return (
    <div
      onClick={() => onSelect?.(scenario.id)}
      className={
        'cursor-pointer rounded-lg border p-3 transition-colors ' +
        (focused
          ? 'border-cyan-400 bg-slate-800/80 ring-1 ring-cyan-400/40'
          : primary
            ? 'border-slate-600 bg-slate-800/60 hover:border-slate-500'
            : 'border-slate-700/60 bg-slate-800/30 hover:border-slate-600')
      }
      title={focused ? 'Click para volver a la vista general' : 'Click para aislar en el gráfico'}
    >
      <div className="mb-1.5 flex flex-wrap items-center gap-x-2 gap-y-1">
        <span
          className={
            'rounded border px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide ' +
            CONFIDENCE_STYLE[scenario.confidence]
          }
        >
          {primary ? 'Primario' : 'Alternativo'} · {scenario.confidence}
        </span>
        <span
          className={'rounded border px-1.5 py-0.5 text-[10px] font-bold uppercase ' + meta.badge}
        >
          {meta.label}
        </span>
        <span
          title={TRADE_BIAS_BADGE[tradeBias].title}
          className={
            'rounded border px-1.5 py-0.5 text-[10px] font-bold uppercase ' +
            TRADE_BIAS_BADGE[tradeBias].cls
          }
        >
          {TRADE_BIAS_BADGE[tradeBias].label}
        </span>
        <span
          className="ml-auto font-mono text-[10px] text-slate-500"
          title={`Score interno del motor: ${scenario.score}/100 (solo para ordenar escenarios, no es una probabilidad).`}
        >
          {scenario.score}
        </span>
      </div>

      <h3 className={'text-sm font-semibold ' + accent}>{scenario.title}</h3>

      <div className="mt-1 text-[11px] text-slate-400">
        <span className="text-slate-300">{likelihood.term}</span>
        {scenario.developing ? (
          // El backtest solo cuenta conteos confirmados; su frecuencia no es
          // comparable con un conteo aún en desarrollo, así que no se muestra.
          <span className="ml-1 text-slate-600">· en desarrollo, sin frecuencia comparable</span>
        ) : !projectsTarget ? (
          // La frecuencia del backtest mide si el escenario ALCANZA su objetivo
          // proyectado tras confirmar. Una corrección ya completada no tiene objetivo
          // pendiente que medir, así que la frecuencia no aplica (induciría a error).
          <span className="ml-1 text-slate-600">· estructura completada, sin objetivo pendiente</span>
        ) : likelihood.calibrated && likelihood.frequency ? (
          <span
            title="Frecuencia observada en el backtest del motor (conteos YA confirmados de este par/TF), medida desde la barra de confirmación. No predice el futuro."
            className="ml-1 text-slate-500"
          >
            · histórico: alcanzó su objetivo {likelihood.frequency.hits} de{' '}
            {likelihood.frequency.total} veces en conteos confirmados similares
          </span>
        ) : (
          <span className="ml-1 text-slate-600">· aún sin histórico suficiente para este par</span>
        )}
      </div>
      {scenario.developing && (
        <span className="mt-1 inline-block rounded bg-slate-700 px-1.5 py-0.5 text-[10px] text-slate-300">
          en desarrollo · puede repintar
        </span>
      )}

      {/* Pronóstico explícito de continuación para ondas en desarrollo (lo accionable).
          Solo si el borde cercano del objetivo sigue POR DELANTE del precio (aún hay
          recorrido); si el precio ya entró en la zona, el pronóstico ya se consumió. */}
      {scenario.developing &&
        scenario.target &&
        tradeBias !== 'vigilar' &&
        (lastPrice == null ||
          (tradeBias === 'compra'
            ? scenario.target.low > lastPrice
            : scenario.target.high < lastPrice)) && (
          <p className="mt-1.5 rounded border border-amber-700/40 bg-amber-950/20 px-2 py-1 text-[11px] leading-relaxed text-amber-200/90">
            <span className="font-semibold">Pronóstico:</span> continuación{' '}
            {tradeBias === 'compra' ? 'al alza' : 'a la baja'} hacia{' '}
            {fmtZone(scenario.target.low)}–{fmtZone(scenario.target.high)}; se invalida si pierde{' '}
            {fmtZone(scenario.invalidation.price)}.{' '}
            <span className="text-amber-300/70">Mayor incertidumbre: la onda aún puede repintar.</span>
          </p>
        )}

      <div className="mt-1.5 text-[11px]">
        {align === 'favor' && (
          <span className="text-green-300">✓ A favor del marco superior</span>
        )}
        {align === 'contra' && (
          <span className="text-amber-300">⚠ Contra el marco superior (mayor riesgo)</span>
        )}
        {align === 'neutral' && (
          <span className="text-slate-500">Marco superior sin tendencia clara</span>
        )}
      </div>

      <p className="mt-2 text-xs leading-relaxed text-slate-400">{scenario.narrative}</p>

      <dl className="mt-2 space-y-1 text-xs">
        <div className="flex gap-2">
          <dt className="shrink-0 font-medium text-red-300">Invalidación</dt>
          <dd className="text-slate-400">
            <span className="font-mono text-red-200">{fmt(scenario.invalidation.price)}</span>
            <span className="block text-[11px] text-slate-500">{scenario.invalidation.reason}</span>
          </dd>
        </div>
        {scenario.target && (
          <div className="flex gap-2">
            <dt className="shrink-0 font-medium text-cyan-300">{scenario.target.label}</dt>
            <dd className="font-mono text-slate-300">
              {fmt(scenario.target.low)} – {fmt(scenario.target.high)}
            </dd>
          </div>
        )}
      </dl>

      <div className="mt-3 border-t border-slate-700/60 pt-2">
        <div className="mb-1 flex items-center justify-between">
          <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-300">
            Confluencia
          </span>
          <span
            className="font-mono text-xs text-slate-400"
            title="Factores cumplidos / total. La confianza usa una media PONDERADA (los factores tautológicos pesan menos); el % es esa media ponderada."
          >
            {scenario.confluence.score}/{scenario.confluence.max} ·{' '}
            {weightedMetPct(scenario.confluence.factors)}%
          </span>
        </div>
        <ul className="space-y-0.5">
          {scenario.confluence.factors.map((f) => (
            <li key={f.key} className="flex items-start gap-1.5 text-[11px]">
              <span className={f.met ? 'text-green-400' : 'text-slate-600'}>{f.met ? '✓' : '✗'}</span>
              <span className={f.met ? 'text-slate-300' : 'text-slate-500'}>
                {f.label}
                {f.detail && <span className="text-slate-600"> · {f.detail}</span>}
              </span>
            </li>
          ))}
        </ul>
      </div>

      <div className="mt-3 border-t border-slate-700/60 pt-2">
        <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-300">
          Relaciones de onda (Fibonacci)
        </span>
        <ul className="mt-1 space-y-0.5">
          {relations.map((r) => (
            <li key={r.label} className="flex items-baseline gap-2 text-[11px]">
              <span className="w-12 shrink-0 text-slate-500">{r.label}</span>
              <span className="font-mono text-slate-300">{r.value}</span>
              {r.fib && <span className="text-cyan-400/70">{r.fib}</span>}
            </li>
          ))}
        </ul>
      </div>

      {scenario.warnings.length > 0 && (
        <ul className="mt-2 list-inside list-disc text-[11px] text-amber-200/80">
          {scenario.warnings.map((w, i) => (
            <li key={i}>{w}</li>
          ))}
        </ul>
      )}
    </div>
  )
}

/** Panel de fiabilidad histórica del propio motor sobre el par/TF actual. */
function EngineReliabilityCard({ insight }: { insight: BacktestInsight }) {
  const { result, calibration, developingCalibration } = insight
  const pct = calibration.hitRate != null ? Math.round(calibration.hitRate * 100) : null
  const devPct = developingCalibration.hitRate != null ? Math.round(developingCalibration.hitRate * 100) : null
  return (
    <div className="rounded-lg border border-slate-700 bg-slate-800/40 p-3">
      <div className="flex items-center gap-2">
        <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-300">
          Fiabilidad histórica del motor
        </span>
      </div>

      {/* Pronósticos en desarrollo: lo que más interesa operar (continuación). */}
      {result.developingResolved > 0 && (
        <div className="mt-1.5 rounded border border-amber-700/40 bg-amber-950/20 p-2">
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-semibold uppercase tracking-wide text-amber-300">
              Pronósticos en desarrollo
            </span>
            <span className="ml-auto font-mono text-[11px] text-slate-400">
              {result.developingResolved} casos
            </span>
          </div>
          <p className="mt-1 text-[11px] leading-relaxed text-slate-400">
            Los pronósticos de <strong className="text-amber-200">continuación</strong> (onda en curso
            hacia su objetivo) lo alcanzaron antes que la invalidación{' '}
            {devPct != null && <strong className="text-amber-200">{devPct}% de las veces</strong>} (
            {developingCalibration.hits}/{result.developingResolved}). Más útiles para operar, pero más
            inciertos: la onda aún puede repintar.
          </p>
        </div>
      )}

      <p className="mt-2 text-xs leading-relaxed text-slate-400">
        Conteos <strong className="text-slate-300">confirmados</strong> (ya completados):
        alcanzaron su zona objetivo antes que la invalidación{' '}
        {pct != null ? (
          <strong className="text-slate-200">{pct}% de las veces</strong>
        ) : (
          'sin casos suficientes'
        )}{' '}
        {result.resolved > 0 && `(${calibration.hits}/${result.resolved})`}.
      </p>
      <div className="mt-2 space-y-1">
        {calibration.buckets
          .filter((b) => b.n > 0)
          .map((b) => (
            <div key={b.label} className="flex items-center gap-2 text-[11px]">
              <span className="w-12 capitalize text-slate-400">{b.label}</span>
              <div className="h-1.5 flex-1 overflow-hidden rounded bg-slate-700">
                <div
                  className="h-full rounded bg-cyan-500/70"
                  style={{ width: `${Math.round((b.hitRate ?? 0) * 100)}%` }}
                />
              </div>
              <span className="w-16 text-right font-mono text-slate-500">
                {b.hitRate != null ? Math.round(b.hitRate * 100) : '—'}% · {b.n}
              </span>
            </div>
          ))}
      </div>

      {(() => {
        // Transparencia: factores de confluencia con muestra suficiente, ordenados
        // por lift observado. Es dato observado (no se usa para repesar el score).
        const stats = calibration.factorStats
          .filter((f) => f.metN >= MIN_CALIBRATION_SAMPLE)
          .sort((a, b) => b.lift - a.lift)
          .slice(0, 5)
        if (stats.length === 0) return null
        return (
          <div className="mt-3 border-t border-slate-700/60 pt-2">
            <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">
              Factores presentes en los aciertos
            </span>
            <p className="mt-0.5 text-[10px] leading-relaxed text-slate-600">
              Tasa de acierto observada cuando el factor estaba presente. Es asociación, no causa, y
              con muestra pequeña; no se usa para repesar el score.
            </p>
            <div className="mt-1 space-y-0.5">
              {stats.map((f) => (
                <div key={f.key} className="flex items-center gap-2 text-[11px]">
                  <span className="flex-1 truncate text-slate-400">{FACTOR_LABEL[f.key] ?? f.key}</span>
                  <span
                    className={
                      'font-mono ' + (f.lift > 0.05 ? 'text-emerald-400' : f.lift < -0.05 ? 'text-red-400' : 'text-slate-500')
                    }
                    title="Tasa de acierto observada cuando este factor estaba presente · nº de casos. Dato observado, no una probabilidad."
                  >
                    {Math.round(f.hitRateWhenMet * 100)}% · {f.metN}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )
      })()}
      <p className="mt-2 text-[10px] leading-relaxed text-slate-500">
        Backtest walk-forward sin look-ahead (solo velas pasadas alimentan el conteo; el desenlace
        usa solo velas posteriores). Agrega impulsos y diagonales confirmados en ambas direcciones,
        medidos desde la barra de confirmación (cuando el conteo es accionable); no es específico del
        conteo de arriba. Muestra pequeña por par; mide la utilidad del conteo, no la rentabilidad.
        El pasado no garantiza el futuro.
      </p>
    </div>
  )
}

/** Estructura de mercado: VWAP anclado + soportes/resistencias horizontales. */
function MarketStructureCard({
  vwap,
  levels,
  price,
}: {
  vwap?: AnchoredVwap | null
  levels: SrLevel[]
  price?: number | null
}) {
  if ((!vwap && levels.length === 0) || price == null) return null
  const vwapDiff = vwap ? (price - vwap.current) / vwap.current : null
  // Niveles más fuertes que NO están justo en el precio, ordenados por cercanía.
  const shown = levels
    .map((l) => ({ ...l, kind: classifyLevel(l, price) }))
    .filter((l) => l.kind !== 'en-precio')
    .sort((a, b) => Math.abs(a.price - price) - Math.abs(b.price - price))
    .slice(0, 3)

  return (
    <div className="rounded-lg border border-slate-700 bg-slate-800/40 p-3">
      <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-300">
        Estructura de mercado
      </span>
      {vwap && vwapDiff != null && (
        <p className="mt-1.5 text-[11px] leading-relaxed text-slate-400">
          <span className="text-violet-300">VWAP anclado {fmtZone(vwap.current)}</span> · precio{' '}
          <strong className={vwapDiff >= 0 ? 'text-green-300' : 'text-red-300'}>
            {vwapDiff >= 0 ? '+' : ''}
            {(vwapDiff * 100).toFixed(1)}%
          </strong>{' '}
          {vwapDiff >= 0 ? 'por encima' : 'por debajo'} (los{' '}
          {vwapDiff >= 0 ? 'compradores' : 'vendedores'} dominan desde el origen del conteo).
        </p>
      )}
      {shown.length > 0 && (
        <ul className="mt-1.5 space-y-0.5 text-[11px]">
          {shown.map((l) => (
            <li key={l.price} className="flex items-center gap-2">
              <span className={l.kind === 'soporte' ? 'text-green-300' : 'text-red-300'}>
                {l.kind === 'soporte' ? 'Soporte' : 'Resistencia'}
              </span>
              <span className="font-mono text-slate-300">{fmtZone(l.price)}</span>
              <span className="text-slate-500">· tocado {l.touches}×</span>
            </li>
          ))}
        </ul>
      )}
      <p className="mt-1.5 text-[10px] leading-relaxed text-slate-500">
        Niveles donde el precio ha reaccionado y VWAP de las operaciones desde el origen: confluencia,
        no señal. Si un objetivo o la invalidación coinciden con un nivel, gana relevancia.
      </p>
    </div>
  )
}

export function AnalysisPanel({
  scenarios,
  higher,
  base,
  symbol,
  timeframe,
  fibZone,
  vwap,
  structureLevels,
  forecast,
  lastPrice,
  closedPrice,
  focusedId,
  backtest,
  onSelect,
  alertsSlot,
}: {
  scenarios: Scenario[]
  higher: HigherContext
  base: string
  symbol?: string
  timeframe?: string
  fibZone?: FibZone | null
  vwap?: AnchoredVwap | null
  structureLevels?: SrLevel[]
  forecast?: WaveForecast | null
  lastPrice?: number | null
  /** Precio de la última vela cerrada (para el cross-check con CoinGecko). */
  closedPrice?: number | null
  focusedId?: string | null
  backtest?: BacktestInsight | null
  onSelect?: (id: string) => void
  alertsSlot?: ReactNode
}) {
  // El posicionamiento de derivados se contrasta con el escenario que el usuario está
  // mirando: el aislado si hay uno, o el primario por defecto (antes siempre el primario,
  // lo que descuadraba la lectura al aislar un alternativo de sesgo contrario).
  const biasScenario = (focusedId && scenarios.find((s) => s.id === focusedId)) || scenarios[0]
  return (
    <aside className="flex w-full shrink-0 flex-col gap-3 overflow-visible border-t border-slate-800 bg-slate-900/40 p-4 lg:w-96 lg:overflow-y-auto lg:border-l lg:border-t-0">
      <div>
        <h2 className="text-sm font-bold tracking-wide text-slate-200">Análisis de Elliott</h2>
        <p className="mt-0.5 text-xs text-slate-500">
          Escenarios probabilísticos sobre velas cerradas. No son señales de compra/venta.
        </p>
      </div>

      {alertsSlot}
      <HigherContextCard ctx={higher} />
      <MarketContextCard base={base} referencePrice={closedPrice ?? lastPrice} />
      {scenarios.length > 0 && (
        <DerivativesCard base={base} bias={scenarioBias(biasScenario)} />
      )}
      <MarketStructureCard vwap={vwap} levels={structureLevels ?? []} price={lastPrice} />
      {forecast && (
        <p className="rounded border border-violet-700/40 bg-violet-950/20 px-2 py-1.5 text-[11px] leading-relaxed text-violet-200/90">
          <span className="font-semibold">Proyección de ondas activa</span> ({forecast.ghosts.map((g) => g.label).join(' · ')}).{' '}
          {forecast.warnings[0]}
        </p>
      )}
      {fibZone && <FibZoneCard zone={fibZone} />}

      {scenarios.length === 0 ? (
        <div className="rounded-lg border border-dashed border-slate-700 bg-slate-800/40 p-3 text-xs leading-relaxed text-slate-400">
          No se detecta una estructura de Elliott clara con la sensibilidad actual. Prueba a cambiar
          el grado de onda o la temporalidad.
        </div>
      ) : (
        scenarios.map((s, i) => (
          <ScenarioCard
            key={s.id}
            scenario={s}
            primary={i === 0}
            bias={higher.bias}
            focused={focusedId === s.id}
            calibration={backtest?.calibration}
            lastPrice={lastPrice}
            onSelect={onSelect}
          />
        ))
      )}

      {backtest && <EngineReliabilityCard insight={backtest} />}
      {scenarios.length > 1 && (
        <p className="text-[11px] text-slate-500">
          {focusedId
            ? 'Escenario aislado en el gráfico. Vuelve a clicar la tarjeta para ver impulso + corrección.'
            : 'Click en una tarjeta para aislar ese conteo en el gráfico.'}
        </p>
      )}

      {scenarios.length > 0 && (
        // Si hay un escenario aislado, la calculadora lo usa (permite ver el plan de
        // un pronóstico en desarrollo concreto); si no, el primario.
        <RiskCalculatorCard
          scenario={scenarios.find((s) => s.id === focusedId) ?? scenarios[0]}
          price={lastPrice}
          symbol={symbol}
          timeframe={timeframe}
        />
      )}

      <div className="mt-auto rounded-lg border border-amber-700/40 bg-amber-950/30 p-3 text-xs leading-relaxed text-amber-200/90">
        <strong className="font-semibold text-amber-300">Aviso de riesgo.</strong> Esta herramienta
        ofrece análisis probabilístico, no recomendaciones de compra/venta. El conteo de Elliott es
        subjetivo y puede fallar o cambiar con nuevas velas. Cada usuario es responsable de sus
        propias decisiones y de su gestión de riesgo.
      </div>
    </aside>
  )
}
