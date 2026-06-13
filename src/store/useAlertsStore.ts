import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { AlertLevel, Bias } from '@/domain/elliott/opportunity'

export interface Alert {
  id: string
  symbol: string
  base: string
  timeframe: string
  bias: Bias
  title: string
  reason: string
  score: number
  ts: number
}

interface AlertsState {
  enabled: boolean
  watchlist: string[]
  /** Exigencia del criterio de oportunidad. */
  level: AlertLevel
  /** Temporalidad fija en la que se vigila la watchlist (independiente del gráfico). */
  alertTimeframe: string
  /** Minutos entre re-escaneos de la watchlist. */
  intervalMin: number
  alerts: Alert[]
  /** Firma de alerta → último epoch ms en que se disparó (para el cooldown). */
  firedAt: Record<string, number>
  setEnabled: (enabled: boolean) => void
  setLevel: (level: AlertLevel) => void
  setAlertTimeframe: (tf: string) => void
  setIntervalMin: (min: number) => void
  addPair: (symbol: string) => void
  removePair: (symbol: string) => void
  pushAlert: (alert: Alert) => void
  markFired: (sig: string) => void
  resetFired: () => void
  clearAlerts: () => void
}

/** Opciones de intervalo de re-escaneo (minutos). */
export const INTERVAL_OPTIONS = [1, 2, 5, 15] as const

/** Etiquetas de los niveles de exigencia. */
export const LEVEL_OPTIONS: { value: AlertLevel; label: string }[] = [
  { value: 'estricto', label: 'Estricto' },
  { value: 'equilibrado', label: 'Equilibrado' },
  { value: 'amplio', label: 'Amplio' },
]

const DEFAULT_WATCHLIST = ['BTCUSDC', 'ETHUSDC', 'SOLUSDC', 'BNBUSDC']

/** No repetir la misma alerta dentro de esta ventana. */
export const ALERT_COOLDOWN_MS = 4 * 60 * 60 * 1000

export const useAlertsStore = create<AlertsState>()(
  persist(
    (set) => ({
      enabled: false,
      watchlist: DEFAULT_WATCHLIST,
      level: 'equilibrado',
      alertTimeframe: '4h',
      intervalMin: 2,
      alerts: [],
      firedAt: {},
      setEnabled: (enabled) => set({ enabled }),
      setLevel: (level) => set({ level }),
      setAlertTimeframe: (alertTimeframe) => set({ alertTimeframe }),
      setIntervalMin: (intervalMin) => set({ intervalMin }),
      addPair: (symbol) =>
        set((s) => (s.watchlist.includes(symbol) ? s : { watchlist: [...s.watchlist, symbol] })),
      removePair: (symbol) => set((s) => ({ watchlist: s.watchlist.filter((p) => p !== symbol) })),
      pushAlert: (alert) => set((s) => ({ alerts: [alert, ...s.alerts].slice(0, 50) })),
      markFired: (sig) =>
        set((s) => {
          // Poda entradas ya caducadas (no influyen en el cooldown) antes de añadir.
          const now = Date.now()
          const firedAt: Record<string, number> = {}
          for (const [key, ts] of Object.entries(s.firedAt)) {
            if (now - ts < ALERT_COOLDOWN_MS) firedAt[key] = ts
          }
          firedAt[sig] = now
          return { firedAt }
        }),
      resetFired: () => set({ firedAt: {} }),
      clearAlerts: () => set({ alerts: [] }),
    }),
    {
      name: 'cripto-elliott-alerts',
      partialize: (s) => ({
        enabled: s.enabled,
        watchlist: s.watchlist,
        level: s.level,
        alertTimeframe: s.alertTimeframe,
        intervalMin: s.intervalMin,
        alerts: s.alerts,
        firedAt: s.firedAt,
      }),
    },
  ),
)
