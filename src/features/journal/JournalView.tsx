import { useState } from 'react'
import { useJournalStore } from '@/store/useJournalStore'
import { journalStats, type JournalEntry, type TradeStatus } from '@/domain/journal'
import { formatPrice } from '@/lib/format'

const PATTERN_LABEL: Record<string, string> = {
  impulso: 'Impulso',
  diagonal: 'Diagonal',
  zigzag: 'Zigzag',
  flat: 'Plana',
  triangulo: 'Triángulo',
  wxy: 'Doble W-X-Y',
}

const STATUS_STYLE: Record<TradeStatus, string> = {
  abierta: 'border-cyan-500/30 bg-cyan-500/15 text-cyan-300',
  ganada: 'border-green-500/30 bg-green-500/15 text-green-300',
  perdida: 'border-red-500/30 bg-red-500/15 text-red-300',
  breakeven: 'border-slate-500/30 bg-slate-500/15 text-slate-300',
  cancelada: 'border-slate-600 bg-slate-700/40 text-slate-400',
}

function fmtR(r: number | null | undefined): string {
  if (r == null) return '—'
  return `${r >= 0 ? '+' : ''}${r.toFixed(2)}R`
}

function relDate(ts: number): string {
  const d = new Date(ts)
  return d.toLocaleDateString('es-ES', { day: '2-digit', month: 'short' }) + ' ' +
    d.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })
}

function JournalRow({ e }: { e: JournalEntry }) {
  const { resolve, remove } = useJournalStore()
  const [exit, setExit] = useState('')

  const close = (status: TradeStatus) => {
    // Precio de salida solo válido si es un número POSITIVO (un negativo daría un R sin sentido).
    const n = Number(exit)
    const px = (status === 'ganada' || status === 'perdida') && n > 0 ? n : null
    resolve(e.id, status, px)
  }

  return (
    <li className="rounded-lg border border-slate-700/60 bg-slate-800/40 p-2.5">
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="text-sm font-semibold text-slate-100">{e.base}/USDC</span>
        <span className="text-[11px] text-slate-400">{e.timeframe}</span>
        <span className="rounded border border-slate-600 px-1.5 py-0.5 text-[10px] text-slate-300">
          {PATTERN_LABEL[e.pattern] ?? e.pattern}
        </span>
        <span
          className={
            'rounded border px-1.5 py-0.5 text-[10px] font-bold uppercase ' +
            (e.bias === 'compra'
              ? 'border-green-500/30 bg-green-500/15 text-green-300'
              : 'border-red-500/30 bg-red-500/15 text-red-300')
          }
        >
          {e.bias === 'compra' ? 'largo' : 'corto'}
        </span>
        {e.developing && (
          <span className="rounded bg-amber-950/40 px-1.5 py-0.5 text-[9px] text-amber-300">
            en desarrollo
          </span>
        )}
        <span
          className={'rounded border px-1.5 py-0.5 text-[10px] font-semibold uppercase ' + STATUS_STYLE[e.status]}
        >
          {e.status}
          {e.realizedR != null && ` · ${fmtR(e.realizedR)}`}
        </span>
        <span className="ml-auto text-[10px] text-slate-500">{relDate(e.createdAt)}</span>
      </div>

      <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-0.5 font-mono text-[11px] text-slate-400">
        <span>Entrada {formatPrice(e.entry)}</span>
        <span className="text-red-200/80">Stop {formatPrice(e.stop)}</span>
        <span className="text-cyan-200/80">Objetivo {e.target != null ? formatPrice(e.target) : '—'}</span>
        <span>R:R plan {e.plannedRr != null ? `1:${e.plannedRr.toFixed(2)}` : '—'}</span>
        {e.exitPrice != null && <span>Salida {formatPrice(e.exitPrice)}</span>}
      </div>

      {e.status === 'abierta' ? (
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          <input
            type="number"
            value={exit}
            onChange={(ev) => setExit(ev.target.value)}
            placeholder="precio salida"
            aria-label="Precio de salida"
            className="w-28 rounded border border-slate-600 bg-slate-800 px-1.5 py-0.5 text-right font-mono text-[11px] text-slate-200 outline-none focus:border-cyan-500"
          />
          <button onClick={() => close('ganada')} className="rounded bg-green-600/20 px-2 py-0.5 text-[11px] font-semibold text-green-300 hover:bg-green-600/30">
            Ganada
          </button>
          <button onClick={() => close('perdida')} className="rounded bg-red-600/20 px-2 py-0.5 text-[11px] font-semibold text-red-300 hover:bg-red-600/30">
            Perdida
          </button>
          <button onClick={() => close('breakeven')} className="rounded bg-slate-600/30 px-2 py-0.5 text-[11px] text-slate-300 hover:bg-slate-600/50">
            B/E
          </button>
          <button onClick={() => close('cancelada')} className="rounded bg-slate-600/20 px-2 py-0.5 text-[11px] text-slate-400 hover:bg-slate-600/40">
            Cancelar
          </button>
          <button onClick={() => remove(e.id)} title="Eliminar" className="ml-auto rounded px-1.5 py-0.5 text-[11px] text-slate-500 hover:text-red-300">
            🗑
          </button>
        </div>
      ) : (
        <div className="mt-1.5 flex items-center gap-2">
          <button onClick={() => resolve(e.id, 'abierta', null)} className="rounded px-1.5 py-0.5 text-[10px] text-slate-500 hover:text-cyan-300">
            reabrir
          </button>
          <button onClick={() => remove(e.id)} title="Eliminar" className="ml-auto rounded px-1.5 py-0.5 text-[11px] text-slate-500 hover:text-red-300">
            🗑
          </button>
        </div>
      )}
    </li>
  )
}

/** Diario de operaciones: cierra el bucle hipótesis→resultado y muestra tu calibración personal. */
export function JournalView() {
  const entries = useJournalStore((s) => s.entries)
  const clear = useJournalStore((s) => s.clear)
  const s = journalStats(entries)

  return (
    <section className="flex flex-1 flex-col gap-3 overflow-y-auto p-3 sm:p-4">
      <div className="flex items-center gap-2">
        <h2 className="text-sm font-bold tracking-wide text-slate-200">Diario de operaciones</h2>
        {entries.length > 0 && (
          <button
            onClick={() => {
              if (confirm('¿Borrar todas las anotaciones del diario?')) clear()
            }}
            className="ml-auto text-[11px] text-slate-500 hover:text-red-300"
          >
            Vaciar
          </button>
        )}
      </div>

      {entries.length === 0 ? (
        <div className="rounded-lg border border-dashed border-slate-700 bg-slate-800/40 p-4 text-sm leading-relaxed text-slate-400">
          Aún no has anotado ninguna operación. En el análisis, pulsa{' '}
          <span className="text-cyan-300">«+ Guardar en el diario»</span> en la calculadora de riesgo
          para registrar una hipótesis. Luego márcala como ganada/perdida con su precio de salida y el
          diario calculará tu win rate y tu R medio reales — tu propia calibración, no la del backtest.
        </div>
      ) : (
        <>
          {/* Resumen de estadísticas */}
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <Stat label="Operaciones" value={`${s.total}`} sub={`${s.open} abiertas`} />
            <Stat
              label="Win rate"
              value={s.winRate != null ? `${Math.round(s.winRate * 100)}%` : '—'}
              sub={`${s.wins}/${s.decided} decididas`}
            />
            <Stat label="R:R medio (plan)" value={s.avgPlannedRr != null ? `1:${s.avgPlannedRr.toFixed(2)}` : '—'} />
            <Stat
              label="R acumulado"
              value={fmtR(s.realizedRSum)}
              tone={s.realizedRSum != null ? (s.realizedRSum >= 0 ? 'pos' : 'neg') : undefined}
            />
          </div>

          {s.byPattern.some((p) => p.winRate != null) && (
            <div className="rounded-lg border border-slate-700 bg-slate-800/40 p-3">
              <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-300">
                Win rate por patrón
              </span>
              <div className="mt-1.5 space-y-1">
                {s.byPattern
                  .filter((p) => p.winRate != null)
                  .map((p) => (
                    <div key={p.pattern} className="flex items-center gap-2 text-[11px]">
                      <span className="w-24 text-slate-400">{PATTERN_LABEL[p.pattern] ?? p.pattern}</span>
                      <div className="h-1.5 flex-1 overflow-hidden rounded bg-slate-700">
                        <div className="h-full rounded bg-cyan-500/70" style={{ width: `${Math.round((p.winRate ?? 0) * 100)}%` }} />
                      </div>
                      <span className="w-16 text-right font-mono text-slate-500">
                        {Math.round((p.winRate ?? 0) * 100)}% · {p.n}
                      </span>
                    </div>
                  ))}
              </div>
              <p className="mt-2 text-[10px] leading-relaxed text-slate-500">
                Tu historial real con muestra pequeña: orientativo, no garantiza resultados futuros.
              </p>
            </div>
          )}

          <ul className="space-y-2">
            {entries.map((e) => (
              <JournalRow key={e.id} e={e} />
            ))}
          </ul>
        </>
      )}
    </section>
  )
}

function Stat({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: 'pos' | 'neg' }) {
  const valueColor = tone === 'pos' ? 'text-green-300' : tone === 'neg' ? 'text-red-300' : 'text-slate-100'
  return (
    <div className="rounded-lg border border-slate-700 bg-slate-800/40 p-2.5">
      <div className="text-[10px] uppercase tracking-wide text-slate-500">{label}</div>
      <div className={'mt-0.5 font-mono text-lg font-semibold ' + valueColor}>{value}</div>
      {sub && <div className="text-[10px] text-slate-500">{sub}</div>}
    </div>
  )
}
