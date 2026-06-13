import { useEffect, useState } from 'react'
import { TIMEFRAMES } from '@/types/market'
import { formatPrice } from '@/lib/format'
import type { Bias } from '@/domain/elliott/opportunity'
import type { Confidence, ScenarioPattern } from '@/domain/elliott/types'
import { useScanner, type ScanResult } from './useScanner'

const BIAS_STYLE: Record<Bias, string> = {
  compra: 'bg-green-500/15 text-green-300 border-green-500/30',
  venta: 'bg-red-500/15 text-red-300 border-red-500/30',
  vigilar: 'bg-amber-500/15 text-amber-300 border-amber-500/30',
}
const CONF_STYLE: Record<Confidence, string> = {
  alta: 'text-green-300',
  media: 'text-amber-300',
  baja: 'text-slate-400',
}
const PATTERN_LABEL: Record<ScenarioPattern, string> = {
  impulso: 'Impulso',
  diagonal: 'Diagonal',
  zigzag: 'Zigzag',
  flat: 'Plana',
  triangulo: 'Triángulo',
  wxy: 'Doble W-X-Y',
}

function relTime(ts: number): string {
  const m = Math.floor((Date.now() - ts) / 60000)
  if (m < 1) return 'hace un momento'
  if (m < 60) return `hace ${m} min`
  return `hace ${Math.floor(m / 60)} h`
}

function ResultRow({ r, onSelect }: { r: ScanResult; onSelect: (s: string) => void }) {
  const up = (r.changePct ?? 0) >= 0
  return (
    <button
      onClick={() => onSelect(r.symbol)}
      className="grid w-full grid-cols-[1fr_auto] items-center gap-3 rounded-lg border border-slate-700/60 bg-slate-800/40 p-3 text-left transition-colors hover:border-slate-600"
    >
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <span className="font-semibold text-slate-100">{r.base}/USDC</span>
          <span
            className={
              'rounded border px-1.5 py-0.5 text-[10px] font-bold uppercase ' + BIAS_STYLE[r.bias]
            }
          >
            {r.bias}
          </span>
          {r.developing && (
            <span className="rounded bg-slate-700 px-1.5 py-0.5 text-[9px] text-slate-300">
              en desarrollo
            </span>
          )}
        </div>
        <div className="mt-0.5 truncate text-xs text-slate-400">{r.title}</div>
      </div>

      <div className="text-right">
        <div className="flex items-baseline justify-end gap-2">
          <span className="font-mono text-sm text-slate-200">{formatPrice(r.price)}</span>
          {r.changePct != null && (
            <span className={'font-mono text-xs ' + (up ? 'text-green-400' : 'text-red-400')}>
              {up ? '+' : ''}
              {r.changePct.toFixed(2)}%
            </span>
          )}
        </div>
        <div className="mt-0.5 flex items-center justify-end gap-2 text-xs">
          <span className="text-slate-500">{PATTERN_LABEL[r.pattern]}</span>
          <span className="font-mono text-slate-400">
            score <span className="text-slate-200">{r.score}</span>
          </span>
          <span className={'font-semibold ' + CONF_STYLE[r.confidence]}>{r.confidence}</span>
        </div>
      </div>
    </button>
  )
}

export function ScannerView({ onSelectPair }: { onSelectPair: (symbol: string) => void }) {
  const { results, scanning, progress, error, lastScan, scan } = useScanner()
  const [timeframe, setTimeframe] = useState('4h')
  const [onlyActionable, setOnlyActionable] = useState(false)

  // Escanea al entrar y cuando cambia la temporalidad.
  useEffect(() => {
    void scan(timeframe)
  }, [timeframe, scan])

  const shown = onlyActionable ? results.filter((r) => r.actionable) : results

  return (
    <section className="flex flex-1 flex-col overflow-visible p-3 sm:p-4 lg:min-h-0 lg:overflow-y-auto">
      <div className="mb-3 flex flex-wrap items-center gap-x-3 gap-y-2">
        <h2 className="text-sm font-bold text-slate-100">Escáner de oportunidades</h2>
        <div className="flex items-center gap-1 rounded-md border border-slate-700 bg-slate-800 p-0.5">
          {TIMEFRAMES.map((tf) => (
            <button
              key={tf}
              onClick={() => setTimeframe(tf)}
              className={
                'rounded px-2 py-1 text-xs font-semibold transition-colors ' +
                (timeframe === tf ? 'bg-cyan-500 text-slate-900' : 'text-slate-300 hover:bg-slate-700')
              }
            >
              {tf}
            </button>
          ))}
        </div>
        <label className="flex items-center gap-1.5 text-xs text-slate-400">
          <input
            type="checkbox"
            checked={onlyActionable}
            onChange={(e) => setOnlyActionable(e.target.checked)}
            className="accent-cyan-500"
          />
          Solo accionables
        </label>
        <button
          onClick={() => void scan(timeframe)}
          disabled={scanning}
          className="rounded-md border border-slate-600 bg-slate-800 px-3 py-1 text-xs font-semibold text-slate-200 hover:bg-slate-700 disabled:opacity-50"
        >
          {scanning ? 'Escaneando…' : 'Escanear'}
        </button>
        <span className="text-xs text-slate-500">
          {scanning
            ? `${progress.done}/${progress.total} pares`
            : lastScan
              ? `${shown.length} resultados · ${relTime(lastScan)}`
              : ''}
        </span>
      </div>

      <p className="mb-3 text-[11px] text-slate-500">
        Pares ordenados por score de Elliott. Son hipótesis, no señales de compra/venta. Click en
        uno para analizarlo en detalle.
      </p>

      {error && <p className="text-sm text-red-400">Error: {error}</p>}

      {scanning && results.length === 0 ? (
        <p className="text-sm text-slate-400">Escaneando los pares más líquidos…</p>
      ) : shown.length === 0 ? (
        <p className="text-sm text-slate-400">
          No hay estructuras claras con los filtros actuales. Prueba otra temporalidad o desactiva
          “Solo accionables”.
        </p>
      ) : (
        <div className="flex flex-col gap-2">
          {shown.map((r) => (
            <ResultRow key={r.symbol} r={r} onSelect={onSelectPair} />
          ))}
        </div>
      )}
    </section>
  )
}
