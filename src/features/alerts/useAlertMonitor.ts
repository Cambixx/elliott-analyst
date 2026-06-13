import { useCallback, useEffect, useRef, useState } from 'react'
import { fetchKlines } from '@/api/binance'
import { detectScenarios } from '@/domain/elliott/detector'
import { deriveOpportunity, type Bias } from '@/domain/elliott/opportunity'
import { useMarketStore } from '@/store/useMarketStore'
import { useAlertsStore, ALERT_COOLDOWN_MS as COOLDOWN_MS, type Alert } from '@/store/useAlertsStore'
import { sendNotification } from './notify'

const BASE_TITLE = 'Cripto Elliott Analyst'

const BIAS_EMOJI: Record<Bias, string> = { compra: '🟢', venta: '🔴', vigilar: '🟡' }

/**
 * Vigila la watchlist (en la temporalidad/grado seleccionados) y genera alertas
 * + notificaciones del navegador cuando un par presenta una oportunidad accionable.
 */
export function useAlertMonitor() {
  const sensitivity = useMarketStore((s) => s.sensitivity)
  const enabled = useAlertsStore((s) => s.enabled)
  const watchlist = useAlertsStore((s) => s.watchlist)
  const level = useAlertsStore((s) => s.level)
  const alertTimeframe = useAlertsStore((s) => s.alertTimeframe)
  const intervalMin = useAlertsStore((s) => s.intervalMin)

  const [checking, setChecking] = useState(false)
  const busy = useRef(false)
  const unread = useRef(0)

  // Config en una ref: cambiarla NO recrea checkNow (evita re-escaneos/spam al
  // tocar timeframe/sensibilidad/nivel; el siguiente tick usará los valores nuevos).
  const cfg = useRef({ watchlist, alertTimeframe, sensitivity, level })
  cfg.current = { watchlist, alertTimeframe, sensitivity, level }

  // Cuando la pestaña vuelve a primer plano, limpia el contador del título.
  useEffect(() => {
    const onVisible = () => {
      if (!document.hidden) {
        unread.current = 0
        document.title = BASE_TITLE
      }
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)
  }, [])

  const checkNow = useCallback(async () => {
    if (busy.current) return
    busy.current = true
    setChecking(true)
    let pushed = 0
    const { watchlist, alertTimeframe, sensitivity, level } = cfg.current
    try {
      for (const symbol of watchlist) {
        try {
          const candles = await fetchKlines(symbol, alertTimeframe, 1000)
          // El detector solo ve velas cerradas (anti-repaint, como el resto de
          // consumidores); el precio "actual" sí puede ser el de la vela en curso.
          const closed = candles.filter((c) => c.closed)
          if (closed.length < 50) continue
          const { scenarios } = detectScenarios(closed, sensitivity)
          const primary = scenarios[0]
          if (!primary) continue

          const price = candles[candles.length - 1].close
          const opp = deriveOpportunity(primary, price, level)
          if (!opp) continue

          const sig = `${symbol}|${alertTimeframe}|${primary.pattern}|${primary.direction}|${opp.bias}`
          const last = useAlertsStore.getState().firedAt[sig] ?? 0
          if (Date.now() - last < COOLDOWN_MS) continue

          useAlertsStore.getState().markFired(sig)
          const base = symbol.replace(/USDC$/, '')
          const alert: Alert = {
            id: `${sig}|${Date.now()}`,
            symbol,
            base,
            timeframe: alertTimeframe,
            bias: opp.bias,
            title: primary.title,
            reason: opp.reason,
            score: primary.score,
            ts: Date.now(),
            developing: primary.developing,
          }
          useAlertsStore.getState().pushAlert(alert)
          pushed++
          // Las ondas en desarrollo son pronósticos de continuación, más inciertos.
          const devMark = primary.developing ? ' · en desarrollo (puede repintar)' : ''
          sendNotification(
            `${BIAS_EMOJI[opp.bias]} ${base}/USDC ${alertTimeframe} · ${opp.bias.toUpperCase()}${devMark}`,
            `${primary.title} — ${opp.reason}. Entra a analizar.`,
          )
        } catch {
          /* error en un par concreto: seguimos con el resto */
        }
      }
      // Si llegaron alertas con la pestaña en segundo plano, avisamos en el título.
      if (pushed > 0 && document.hidden) {
        unread.current += pushed
        document.title = `(${unread.current}) 🔔 ${BASE_TITLE}`
      }
    } finally {
      busy.current = false
      setChecking(false)
    }
  }, [])

  // Arranca al activar y re-escanea en el intervalo configurado.
  useEffect(() => {
    if (!enabled) return
    void checkNow()
    const id = setInterval(() => void checkNow(), intervalMin * 60 * 1000)
    return () => clearInterval(id)
  }, [enabled, checkNow, intervalMin])

  return { checkNow, checking }
}
