import { useState, useMemo } from 'react'
import { useMarketStore, SENSITIVITY_PRESETS } from '@/store/useMarketStore'
import { useKlines } from '@/features/chart/useKlines'
import { useLiveCandle } from '@/features/chart/useLiveCandle'
import { useElliott } from '@/features/analysis/useElliott'
import { useHigherTimeframe } from '@/features/analysis/useHigherTimeframe'
import { CandleChart } from '@/features/chart/CandleChart'
import { PairSelector } from '@/features/pair-selector/PairSelector'
import { FavoritesBar } from '@/features/pair-selector/FavoritesBar'
import { TimeframeSelector } from '@/features/timeframe-selector/TimeframeSelector'
import { AnalysisPanel } from '@/features/analysis/AnalysisPanel'
import { FearGreedChip } from '@/features/market-context/MarketContext'
import { useAlertMonitor } from '@/features/alerts/useAlertMonitor'
import { AlertsBell, AlertsCard } from '@/features/alerts/AlertsUI'
import { ScannerView } from '@/features/scanner/ScannerView'
import { JournalView } from '@/features/journal/JournalView'
import { useDataQuality } from '@/features/analysis/useDataQuality'
import { DataQualityBadge } from '@/features/analysis/DataQualityBadge'
import { useBacktest } from '@/features/analysis/useBacktest'
import { computeFibZone } from '@/domain/elliott/fibZone'
import { anchoredVwap } from '@/domain/vwap'
import { computeForecast } from '@/domain/elliott/forecast'
import { supportResistance, classifyLevel } from '@/domain/elliott/levels'
import type { SrDrawItem } from '@/features/chart/CandleChart'
import { formatPrice } from '@/lib/format'
import { useNow } from '@/lib/useNow'

function IndicatorToggle({
  label,
  active,
  onClick,
}: {
  label: string
  active: boolean
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      className={
        'rounded px-2 py-1 text-xs font-semibold transition-colors ' +
        (active ? 'bg-slate-700 text-cyan-300' : 'text-slate-400 hover:bg-slate-800')
      }
    >
      {label}
    </button>
  )
}

export default function App() {
  const {
    symbol,
    interval,
    sensitivity,
    setSymbol,
    setSensitivity,
    showRsi,
    showMacd,
    showForecast,
    toggleRsi,
    toggleMacd,
    toggleForecast,
  } = useMarketStore()
  const { data: candles, isLoading, isError, error } = useKlines(symbol, interval)
  const liveCandle = useLiveCandle(symbol, interval)
  const now = useNow()
  const dataQuality = useDataQuality(candles, interval, now)
  const { scenarios, pivots } = useElliott(candles, sensitivity)
  const backtest = useBacktest(candles, sensitivity)
  const higher = useHigherTimeframe(symbol, interval, sensitivity)
  const { checkNow, checking } = useAlertMonitor()
  const [focusedId, setFocusedId] = useState<string | null>(null)
  const [view, setView] = useState<'analysis' | 'scanner' | 'journal'>('analysis')

  const lastPrice = liveCandle?.close ?? candles?.at(-1)?.close
  // Precio de la última vela CERRADA (para el cross-check con CoinGecko, que es agregado/retardado).
  const closedPrice = candles?.filter((c) => c.closed).at(-1)?.close
  const base = symbol.replace(/USDC$/, '')

  // Click en una tarjeta aísla ese escenario en el gráfico; por defecto se dibujan
  // TODOS los escenarios detectados: el primario (más probable) a plena opacidad
  // y los alternativos atenuados, para ver visualmente los posibles escenarios.
  const focused = focusedId ? (scenarios.find((s) => s.id === focusedId) ?? null) : null
  const drawnScenarios = focused ? [focused] : scenarios

  // Zona de retroceso de Fibonacci del mejor impulso/diagonal ya completado.
  // Se calcula sobre lo que realmente se dibuja: al aislar un escenario que no
  // es ese impulso, la zona desaparece con él (coherencia visual).
  const fibZone = (() => {
    if (!candles || candles.length < 2) return null
    const motive = drawnScenarios.find((s) => s.kind === 'impulse' && !s.developing)
    return motive ? computeFibZone(motive, candles) : null
  })()

  // VWAP anclado al origen del conteo que se dibuja (referencia institucional).
  const closedCandles = candles?.filter((c) => c.closed) ?? []
  const vwap = (() => {
    const anchor = drawnScenarios[0]?.pivots[0]?.index
    if (anchor == null || closedCandles.length < 2) return null
    return anchoredVwap(closedCandles, anchor)
  })()

  // Soportes/resistencias de la estructura (clustering de pivotes del ZigZag),
  // clasificados respecto al precio actual para colorearlos en el gráfico.
  // Proyección hipotética de las ondas que faltan (solo si el toggle está activo).
  // El impulso naciente se filtra por el sesgo del marco superior dentro de computeForecast.
  const forecast = useMemo(
    () => (showForecast ? computeForecast(scenarios, pivots, higher.bias) : null),
    [showForecast, scenarios, pivots, higher.bias],
  )

  const srLevelsRaw = useMemo(() => supportResistance(pivots), [pivots])
  const srLevels: SrDrawItem[] = useMemo(() => {
    if (lastPrice == null) return []
    return srLevelsRaw.map((l) => {
      const kind = classifyLevel(l, lastPrice)
      const tag = kind === 'soporte' ? 'S' : kind === 'resistencia' ? 'R' : '•'
      return { price: l.price, kind, label: `${tag} ×${l.touches}` }
    })
  }, [srLevelsRaw, lastPrice])

  return (
    <div className="flex min-h-dvh flex-col lg:h-screen">
      <header className="flex flex-wrap items-center gap-x-2 gap-y-1.5 border-b border-slate-800 px-3 py-2 sm:gap-x-4 sm:px-4 sm:py-2.5">
        <div className="flex items-center gap-2">
          <div className="h-2.5 w-2.5 rounded-full bg-cyan-400" />
          <h1 className="text-sm font-bold tracking-tight text-slate-100">
            Cripto Elliott Analyst
          </h1>
        </div>

        <div className="flex items-center gap-1 rounded-md border border-slate-700 bg-slate-800 p-0.5">
          {(['analysis', 'scanner', 'journal'] as const).map((v) => (
            <button
              key={v}
              onClick={() => setView(v)}
              className={
                'rounded px-2.5 py-1 text-xs font-semibold transition-colors ' +
                (view === v ? 'bg-cyan-500 text-slate-900' : 'text-slate-300 hover:bg-slate-700')
              }
            >
              {v === 'analysis' ? 'Análisis' : v === 'scanner' ? 'Escáner' : 'Diario'}
            </button>
          ))}
        </div>

        <PairSelector />
        <TimeframeSelector />

        <div className="flex items-center gap-1 rounded-md border border-slate-700 bg-slate-800 p-0.5">
          <IndicatorToggle label="RSI" active={showRsi} onClick={toggleRsi} />
          <IndicatorToggle label="MACD" active={showMacd} onClick={toggleMacd} />
          <IndicatorToggle label="Proyección" active={showForecast} onClick={toggleForecast} />
        </div>

        <label className="flex items-center gap-2">
          <span className="hidden text-xs font-medium text-slate-400 sm:inline">Grado de onda</span>
          <div className="flex items-center gap-1 rounded-md border border-slate-700 bg-slate-800 p-0.5">
            {SENSITIVITY_PRESETS.map((p) => (
              <button
                key={p.label}
                onClick={() => setSensitivity(p.k)}
                className={
                  'rounded px-2 py-1 text-xs font-semibold transition-colors ' +
                  (sensitivity === p.k
                    ? 'bg-cyan-500 text-slate-900'
                    : 'text-slate-300 hover:bg-slate-700')
                }
              >
                {p.label}
              </button>
            ))}
          </div>
        </label>

        <div className="ml-auto flex items-center gap-3">
          {view === 'analysis' && <DataQualityBadge quality={dataQuality} />}
          <AlertsBell />
          <FearGreedChip />
          {lastPrice != null && (
            <div className="flex items-baseline gap-1.5">
              <span className="hidden text-xs text-slate-500 sm:inline">Último</span>
              <span className="font-mono text-sm font-semibold text-slate-100">
                {formatPrice(lastPrice)}
              </span>
              <span className="hidden text-xs text-slate-500 sm:inline">USDC</span>
            </div>
          )}
        </div>
      </header>

      <FavoritesBar />

      {view === 'scanner' ? (
        <ScannerView
          onSelectPair={(s) => {
            setSymbol(s)
            setView('analysis')
          }}
        />
      ) : view === 'journal' ? (
        <JournalView />
      ) : (
        <main className="flex flex-1 flex-col lg:min-h-0 lg:flex-row">
          <section className="relative h-[55vh] lg:h-auto lg:min-h-0 lg:flex-1">
          {isLoading && (
            <div className="absolute inset-0 z-10 flex items-center justify-center text-sm text-slate-400">
              Cargando velas…
            </div>
          )}
          {isError && (
            <div className="absolute inset-0 z-10 flex items-center justify-center px-4 text-center text-sm text-red-400">
              Error al cargar datos: {(error as Error)?.message}
            </div>
          )}
          <CandleChart
            candles={candles ?? []}
            liveCandle={liveCandle}
            scenarios={drawnScenarios}
            fibZone={fibZone}
            vwap={vwap}
            srLevels={srLevels}
            forecast={forecast}
            showRsi={showRsi}
            showMacd={showMacd}
          />
        </section>

        <AnalysisPanel
          scenarios={scenarios}
          higher={higher}
          base={base}
          symbol={symbol}
          timeframe={interval}
          fibZone={fibZone}
          vwap={vwap}
          structureLevels={srLevelsRaw}
          forecast={forecast}
          lastPrice={lastPrice}
          closedPrice={closedPrice}
          focusedId={focusedId}
          backtest={backtest}
          onSelect={(id) => setFocusedId((prev) => (prev === id ? null : id))}
          alertsSlot={
            <AlertsCard currentSymbol={symbol} checkNow={checkNow} checking={checking} />
          }
        />
        </main>
      )}
    </div>
  )
}
