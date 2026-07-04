import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { useAlertsStore, ALERT_COOLDOWN_MS, type Alert } from '@/store/useAlertsStore'

const mkAlert = (id: string): Alert => ({
  id,
  symbol: 'BTCUSDC',
  base: 'BTC',
  timeframe: '4h',
  bias: 'compra',
  title: 't',
  reason: 'r',
  score: 50,
  ts: 0,
})

beforeEach(() => {
  useAlertsStore.setState({ alerts: [], firedAt: {}, watchlist: ['BTCUSDC'] })
})
afterEach(() => {
  vi.useRealTimers()
})

describe('useAlertsStore', () => {
  it('pushAlert respeta el tope de 50, con la más reciente primero', () => {
    for (let i = 0; i < 55; i++) useAlertsStore.getState().pushAlert(mkAlert(`a${i}`))
    const { alerts } = useAlertsStore.getState()
    expect(alerts).toHaveLength(50)
    expect(alerts[0].id).toBe('a54') // la última pusheada va delante
    expect(alerts.some((a) => a.id === 'a4')).toBe(false) // las más viejas se caen
  })

  it('markFired poda las firmas caducadas al añadir una nueva', () => {
    vi.useFakeTimers()
    vi.setSystemTime(0)
    useAlertsStore.getState().markFired('sigA')
    // Pasa el cooldown y dispara otra firma: sigA (caducada) debe podarse.
    vi.setSystemTime(ALERT_COOLDOWN_MS + 1)
    useAlertsStore.getState().markFired('sigB')
    const { firedAt } = useAlertsStore.getState()
    expect(firedAt.sigA).toBeUndefined()
    expect(firedAt.sigB).toBe(ALERT_COOLDOWN_MS + 1)
  })

  it('markFired conserva una firma aún dentro de la ventana de cooldown', () => {
    vi.useFakeTimers()
    vi.setSystemTime(1000)
    useAlertsStore.getState().markFired('sigA')
    vi.setSystemTime(1000 + ALERT_COOLDOWN_MS - 1) // sigue dentro de la ventana
    useAlertsStore.getState().markFired('sigB')
    const { firedAt } = useAlertsStore.getState()
    expect(firedAt.sigA).toBe(1000)
    expect(firedAt.sigB).toBe(1000 + ALERT_COOLDOWN_MS - 1)
  })

  it('resetFired vacía el mapa de cooldown (re-avisa de las oportunidades actuales)', () => {
    useAlertsStore.getState().markFired('x')
    useAlertsStore.getState().resetFired()
    expect(Object.keys(useAlertsStore.getState().firedAt)).toHaveLength(0)
  })

  it('addPair deduplica y removePair quita de la watchlist', () => {
    useAlertsStore.getState().addPair('BTCUSDC') // ya está → no duplica
    useAlertsStore.getState().addPair('ETHUSDC')
    expect(useAlertsStore.getState().watchlist).toEqual(['BTCUSDC', 'ETHUSDC'])
    useAlertsStore.getState().removePair('BTCUSDC')
    expect(useAlertsStore.getState().watchlist).toEqual(['ETHUSDC'])
  })
})
