import type { AlertLevel, Bias } from '@/domain/elliott/opportunity'
import { useAlertsStore, LEVEL_OPTIONS, INTERVAL_OPTIONS } from '@/store/useAlertsStore'
import { TIMEFRAMES } from '@/types/market'
import { usePairs } from '@/features/pair-selector/usePairs'
import { ensurePermission, notificationsSupported, sendNotification } from './notify'

const BIAS_STYLE: Record<Bias, string> = {
  compra: 'bg-green-500/15 text-green-300 border-green-500/30',
  venta: 'bg-red-500/15 text-red-300 border-red-500/30',
  vigilar: 'bg-amber-500/15 text-amber-300 border-amber-500/30',
}

function relTime(ts: number): string {
  const m = Math.floor((Date.now() - ts) / 60000)
  if (m < 1) return 'ahora'
  if (m < 60) return `hace ${m}m`
  const h = Math.floor(m / 60)
  if (h < 24) return `hace ${h}h`
  return `hace ${Math.floor(h / 24)}d`
}

/** Campana de la cabecera: activa/desactiva la vigilancia y pide permiso. */
export function AlertsBell() {
  const { enabled, setEnabled, alerts, resetFired } = useAlertsStore()

  const toggle = async () => {
    if (enabled) {
      setEnabled(false)
      return
    }
    // Pedimos permiso ANTES de activar, para que el primer escaneo ya pueda
    // notificar (si no, ese escaneo "gasta" las oportunidades sin avisar).
    const perm = await ensurePermission()
    // Reinicia el cooldown: el primer escaneo volverá a avisar de las
    // oportunidades actuales (ya con el permiso concedido).
    resetFired()
    setEnabled(true)
    if (perm === 'granted') {
      sendNotification(
        '🔔 Alertas activadas',
        'Te avisaré cuando una cripto entre en zona de oportunidad.',
      )
    }
  }

  return (
    <button
      onClick={toggle}
      title={enabled ? 'Vigilancia activa — click para desactivar' : 'Activar alertas'}
      className={
        'relative flex items-center gap-1.5 rounded-md border px-2 py-1 text-xs font-semibold transition-colors ' +
        (enabled
          ? 'border-cyan-500/40 bg-cyan-500/15 text-cyan-300'
          : 'border-slate-700 bg-slate-800 text-slate-400 hover:text-slate-200')
      }
    >
      <span>{enabled ? '🔔' : '🔕'}</span>
      <span>Alertas</span>
      {alerts.length > 0 && (
        <span className="rounded-full bg-cyan-500 px-1.5 text-[10px] font-bold text-slate-900">
          {alerts.length}
        </span>
      )}
    </button>
  )
}

/** Tarjeta del panel: estado, watchlist y lista de alertas recientes. */
export function AlertsCard({
  currentSymbol,
  checkNow,
  checking,
}: {
  currentSymbol: string
  checkNow: () => void
  checking: boolean
}) {
  const {
    enabled,
    watchlist,
    alerts,
    level,
    alertTimeframe,
    intervalMin,
    setLevel,
    setAlertTimeframe,
    setIntervalMin,
    addPair,
    removePair,
    clearAlerts,
  } = useAlertsStore()
  const { data: pairs } = usePairs()
  const permission = notificationsSupported() ? Notification.permission : 'unsupported'

  const addable = (pairs ?? []).filter((p) => !watchlist.includes(p.symbol))

  return (
    <div className="rounded-lg border border-slate-700 bg-slate-800/40 p-3">
      <div className="flex items-center gap-2">
        <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-300">
          Alertas
        </span>
        <span className={'ml-auto text-[10px] ' + (enabled ? 'text-cyan-300' : 'text-slate-500')}>
          {enabled ? 'vigilando' : 'inactivas'}
        </span>
        <button
          onClick={async () => {
            await ensurePermission()
            sendNotification('🔔 Notificación de prueba', 'Si ves esto, las notificaciones funcionan.')
          }}
          className="rounded border border-slate-600 px-1.5 py-0.5 text-[10px] text-slate-300 hover:bg-slate-700"
          title="Enviar una notificación de prueba"
        >
          probar
        </button>
        <button
          onClick={checkNow}
          disabled={checking}
          className="rounded border border-slate-600 px-1.5 py-0.5 text-[10px] text-slate-300 hover:bg-slate-700 disabled:opacity-50"
        >
          {checking ? 'comprobando…' : 'comprobar ahora'}
        </button>
      </div>

      {permission === 'denied' && (
        <p className="mt-1 text-[10px] text-amber-400">
          Notificaciones bloqueadas en el navegador; las verás aquí igualmente.
        </p>
      )}

      {/* Configuración: nivel de oportunidad e intervalo de re-escaneo */}
      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] text-slate-400">
        <label className="flex items-center gap-1" title="Cuán exigente es el criterio de oportunidad">
          Nivel
          <select
            value={level}
            onChange={(e) => setLevel(e.target.value as AlertLevel)}
            className="rounded border border-slate-600 bg-slate-800 px-1 py-0.5 text-slate-200 outline-none"
          >
            {LEVEL_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
        <label
          className="flex items-center gap-1"
          title="Temporalidad fija en la que se vigila la watchlist (independiente del gráfico)"
        >
          TF
          <select
            value={alertTimeframe}
            onChange={(e) => setAlertTimeframe(e.target.value)}
            className="rounded border border-slate-600 bg-slate-800 px-1 py-0.5 text-slate-200 outline-none"
          >
            {TIMEFRAMES.map((tf) => (
              <option key={tf} value={tf}>
                {tf}
              </option>
            ))}
          </select>
        </label>
        <label className="flex items-center gap-1" title="Cada cuánto se re-escanea la watchlist">
          Cada
          <select
            value={intervalMin}
            onChange={(e) => setIntervalMin(Number(e.target.value))}
            className="rounded border border-slate-600 bg-slate-800 px-1 py-0.5 text-slate-200 outline-none"
          >
            {INTERVAL_OPTIONS.map((m) => (
              <option key={m} value={m}>
                {m} min
              </option>
            ))}
          </select>
        </label>
      </div>

      {/* Watchlist */}
      <div className="mt-2 flex flex-wrap gap-1">
        {watchlist.map((s) => (
          <span
            key={s}
            className="flex items-center gap-1 rounded bg-slate-700/60 px-1.5 py-0.5 text-[10px] text-slate-300"
          >
            {s.replace(/USDC$/, '')}
            <button
              onClick={() => removePair(s)}
              className="text-slate-500 hover:text-red-300"
              title="Quitar de la vigilancia"
              aria-label={`Quitar ${s.replace(/USDC$/, '')} de la vigilancia`}
            >
              <span aria-hidden="true">×</span>
            </button>
          </span>
        ))}
        {!watchlist.includes(currentSymbol) && (
          <button
            onClick={() => addPair(currentSymbol)}
            className="rounded border border-dashed border-slate-600 px-1.5 py-0.5 text-[10px] text-slate-400 hover:text-cyan-300"
            title="Añadir el par que estás viendo"
          >
            + {currentSymbol.replace(/USDC$/, '')}
          </button>
        )}
        {addable.length > 0 && (
          <select
            value=""
            onChange={(e) => {
              if (e.target.value) addPair(e.target.value)
            }}
            title="Añadir cualquier par a la vigilancia"
            className="rounded border border-dashed border-slate-600 bg-transparent px-1 py-0.5 text-[10px] text-slate-400 outline-none hover:text-cyan-300"
          >
            <option value="">+ añadir par…</option>
            {addable.map((p) => (
              <option key={p.symbol} value={p.symbol} className="bg-slate-800 text-slate-200">
                {p.base}/USDC
              </option>
            ))}
          </select>
        )}
      </div>

      {/* Lista de alertas */}
      {alerts.length === 0 ? (
        <p className="mt-2 text-[11px] text-slate-500">
          Sin alertas todavía. {enabled ? 'Vigilando la watchlist…' : 'Activa las alertas con la campana.'}
        </p>
      ) : (
        <>
          <ul className="mt-2 space-y-1.5">
            {alerts.slice(0, 8).map((a) => (
              <li key={a.id} className="rounded border border-slate-700/60 bg-slate-800/40 p-1.5">
                <div className="flex items-center gap-1.5">
                  <span
                    className={'rounded border px-1 py-0.5 text-[9px] font-bold uppercase ' + BIAS_STYLE[a.bias]}
                  >
                    {a.bias}
                  </span>
                  <span className="text-[11px] font-semibold text-slate-200">
                    {a.base}/USDC · {a.timeframe}
                  </span>
                  {a.developing && (
                    <span
                      title="Pronóstico de continuación de una onda en desarrollo: más útil pero más incierto, puede repintar."
                      className="rounded border border-amber-600/40 bg-amber-950/30 px-1 py-0.5 text-[9px] text-amber-300"
                    >
                      en desarrollo
                    </span>
                  )}
                  <span className="ml-auto text-[10px] text-slate-500">{relTime(a.ts)}</span>
                </div>
                <p className="mt-0.5 text-[10px] leading-snug text-slate-400">
                  {a.title} · {a.reason}
                </p>
              </li>
            ))}
          </ul>
          <button
            onClick={clearAlerts}
            className="mt-1.5 text-[10px] text-slate-500 hover:text-slate-300"
          >
            Limpiar alertas
          </button>
        </>
      )}
    </div>
  )
}
