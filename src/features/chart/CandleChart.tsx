import { useEffect, useRef } from 'react'
import { init, dispose, type Chart, type KLineData } from 'klinecharts'
import type { Candle } from '@/types/market'
import type { Scenario } from '@/domain/elliott/types'
import type { FibZone } from '@/domain/elliott/fibZone'
import { darkChartStyles } from './chartStyles'
import type { ElliottExtend } from './elliottOverlay'
import type { FibZoneExtend } from './fibZoneOverlay'
import type { ProjectionExtend } from './projectionOverlay'
import type { ChannelExtend } from './channelOverlay'
import type { VwapExtend } from './vwapOverlay'
import type { SrExtend, SrItem } from './srOverlay'
import type { ForecastExtend } from './forecastOverlay'
import './elliottOverlay' // registra el overlay 'elliottWave'
import './fibZoneOverlay' // registra el overlay 'fibZone'
import './projectionOverlay' // registra el overlay 'projectionPath'
import './channelOverlay' // registra el overlay 'elliottChannel'
import './vwapOverlay' // registra el overlay 'vwapLine'
import './srOverlay' // registra el overlay 'srLevels'
import './forecastOverlay' // registra el overlay 'waveForecast'
import { formatPrice as fmtPrice } from '@/lib/format'
import { projectionTargets } from '@/domain/elliott/projection'
import { channelDrawPoints } from '@/domain/elliott/channel'
import type { AnchoredVwap } from '@/domain/vwap'
import type { WaveForecast } from '@/domain/elliott/forecast'

/** Nivel de S/R ya clasificado respecto al precio actual, listo para dibujar. */
export interface SrDrawItem extends SrItem {
  price: number
}

/** Añade alpha a un color hex #rrggbb → #rrggbbaa. */
const withAlpha = (hex: string, alpha: string) => hex + alpha

interface CandleChartProps {
  candles: Candle[]
  /** Última vela en vivo (del WebSocket); se aplica con updateData sin recargar todo. */
  liveCandle?: Candle | null
  /** Escenarios de Elliott a dibujar. El primero (primario) lleva la línea de invalidación. */
  scenarios: Scenario[]
  /** Zona de retroceso de Fibonacci del impulso completado (si la hay). */
  fibZone?: FibZone | null
  /** VWAP anclado al origen del conteo primario (si lo hay). */
  vwap?: AnchoredVwap | null
  /** Niveles de soporte/resistencia ya clasificados respecto al precio actual. */
  srLevels?: SrDrawItem[]
  /** Proyección hipotética de las ondas que faltan (null si el toggle está apagado o no aplica). */
  forecast?: WaveForecast | null
  showRsi: boolean
  showMacd: boolean
}

const WAVE_COLOR: Record<Scenario['pattern'], string> = {
  impulso: '#22d3ee',
  diagonal: '#2dd4bf',
  zigzag: '#f59e0b',
  flat: '#fb923c',
  triangulo: '#a78bfa',
  wxy: '#fbbf24',
}

function toKLineData(c: Candle): KLineData {
  return {
    timestamp: c.timestamp,
    open: c.open,
    high: c.high,
    low: c.low,
    close: c.close,
    volume: c.volume,
  }
}

export function CandleChart({
  candles,
  liveCandle,
  scenarios,
  fibZone,
  vwap,
  srLevels,
  forecast,
  showRsi,
  showMacd,
}: CandleChartProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const chartRef = useRef<Chart | null>(null)
  const rsiPaneRef = useRef<string | null>(null)
  const macdPaneRef = useRef<string | null>(null)

  // Init / dispose del gráfico
  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    // Idempotente: elimina cualquier instancia previa (React StrictMode monta dos veces).
    try {
      dispose(el)
    } catch {
      /* no había instancia previa */
    }

    const chart = init(el, { styles: darkChartStyles })
    chartRef.current = chart

    // Indicadores base: media móvil sobre las velas + volumen en panel inferior
    chart?.createIndicator('MA', true, { id: 'candle_pane' })
    chart?.createIndicator('VOL')

    const ro = new ResizeObserver(() => chart?.resize())
    ro.observe(el)

    return () => {
      ro.disconnect()
      try {
        dispose(el)
      } catch {
        /* ya dispuesto */
      }
      chartRef.current = null
      rsiPaneRef.current = null
      macdPaneRef.current = null
    }
  }, [])

  // Datos históricos
  useEffect(() => {
    chartRef.current?.applyNewData(candles.map(toKLineData))
  }, [candles])

  // Vela en vivo
  useEffect(() => {
    if (liveCandle) chartRef.current?.updateData(toKLineData(liveCandle))
  }, [liveCandle])

  // Dibujo de los escenarios de Elliott (ondas + zona de Fibonacci + invalidación).
  // Se re-dibuja solo cuando cambia el contenido relevante (firma), no en cada tick.
  // La firma codifica el CONTENIDO dibujado (pivotes, invalidación, objetivos), no
  // solo los ids: dos detecciones distintas pueden compartir id (mismos índices
  // extremos) y dejarían el gráfico obsoleto. toPrecision evita que los pares
  // baratos (<1 USDC) colapsen la discriminación al redondear.
  const sigOf = (s: Scenario) =>
    `${s.id}:${s.pattern}:${s.pivots.map((p) => `${p.timestamp}-${p.price}`).join(',')}:` +
    `${s.invalidation.price}:${s.target?.low ?? ''}-${s.target?.high ?? ''}`
  const drawSig =
    scenarios.map(sigOf).join('|') +
    (fibZone
      ? `#fz:${fibZone.fromTs}:${fibZone.bandLow.toPrecision(8)}:${fibZone.bandHigh.toPrecision(8)}:${fibZone.broken}`
      : '') +
    (vwap ? `#vw:${vwap.anchorIndex}:${vwap.current.toPrecision(6)}` : '') +
    // Solo el PRECIO de los niveles entra en la firma, NO su kind: el kind cambia
    // cada tick al cruzar el precio la banda "en-precio" y forzaría un reborrado
    // completo del gráfico en cada tick. El color del nivel se fija al redibujar.
    (srLevels && srLevels.length
      ? `#sr:${srLevels.map((l) => l.price.toPrecision(6)).join(',')}`
      : '') +
    // CRÍTICO: el forecast debe estar en la firma para que el overlay aparezca/
    // desaparezca al togglear (mismo patrón que el resto de overlays).
    (forecast
      ? `#fc:${forecast.source}:${forecast.ghosts.map((g) => g.price.toPrecision(6)).join(',')}`
      : '')
  useEffect(() => {
    const chart = chartRef.current
    if (!chart) return
    chart.removeOverlay() // limpia overlays previos y redibuja

    // Soportes/resistencias horizontales (independientes del conteo de Elliott:
    // se dibujan aunque no haya escenarios, igual que los muestra el panel).
    if (srLevels && srLevels.length > 0) {
      chart.createOverlay({
        name: 'srLevels',
        lock: true,
        points: srLevels.map((l) => ({ timestamp: candles[candles.length - 1]?.timestamp ?? 0, value: l.price })),
        extendData: { items: srLevels.map((l) => ({ label: l.label, kind: l.kind })) } satisfies SrExtend,
      })
    }

    if (scenarios.length === 0) return

    // VWAP anclado (polilínea desde el origen del conteo).
    if (vwap && vwap.points.length >= 2) {
      chart.createOverlay({
        name: 'vwapLine',
        lock: true,
        points: vwap.points.map((p) => ({ timestamp: p.timestamp, value: p.value })),
        extendData: { color: '#c084fc' } satisfies VwapExtend,
      })
    }

    // Zona de retroceso de Fibonacci (debajo de las ondas).
    if (fibZone) {
      chart.createOverlay({
        name: 'fibZone',
        lock: true,
        // Todos los puntos en fromTs (timestamp válido); la X la fija el ancho del panel.
        points: [
          { timestamp: fibZone.fromTs, value: fibZone.bandHigh },
          { timestamp: fibZone.fromTs, value: fibZone.bandLow },
          ...fibZone.levels.map((l) => ({ timestamp: fibZone.fromTs, value: l.price })),
        ],
        extendData: {
          broken: fibZone.broken,
          labels: fibZone.levels.map((l) => `${l.ratio.toFixed(3)} · ${fmtPrice(l.price)}`),
        } satisfies FibZoneExtend,
      })
    }

    // Polilíneas numeradas: el primario a plena opacidad y encima; los escenarios
    // alternativos ("posibles") atenuados con alpha, debajo.
    scenarios
      .map((scenario, i) => ({ scenario, primary: i === 0 }))
      .reverse()
      .forEach(({ scenario, primary }) => {
        const base = WAVE_COLOR[scenario.pattern]
        const extend: ElliottExtend = {
          color: primary ? base : withAlpha(base, '4D'),
          labels: scenario.labels.map((l) => ({ text: l.text, above: l.above })),
          size: primary ? 2 : 1.2,
          faded: !primary,
        }
        chart.createOverlay({
          name: 'elliottWave',
          lock: true,
          points: scenario.pivots.map((p) => ({ timestamp: p.timestamp, value: p.price })),
          extendData: extend,
        })
      })

    // Canal de Elliott (0-2 / 1-3) del primario si es un IMPULSO de 6 pivotes.
    // Excluye diagonales (cuña): sus líneas convergen, no forman un canal paralelo.
    const channelFrom = scenarios[0]
    if (channelFrom.pattern === 'impulso' && channelFrom.pivots.length >= 6) {
      const pts = channelDrawPoints(channelFrom.pivots)
      if (pts) {
        chart.createOverlay({
          name: 'elliottChannel',
          lock: true,
          points: pts,
          extendData: { color: withAlpha(WAVE_COLOR[channelFrom.pattern], '55') } satisfies ChannelExtend,
        })
      }
    }

    // Proyección punteada del escenario más probable hacia sus objetivos.
    // Solo se omite cuando el forecast EXTIENDE este mismo primario (source
    // 'developing'): ahí parte del mismo origen y la incluiría, duplicando líneas.
    // Un forecast 'nascent' describe otra estructura (un 0-1-2 incipiente), así que
    // la proyección del primario sigue siendo información independiente y se mantiene.
    const projFrom = scenarios[0]
    const targets = projectionTargets(projFrom)
    if (targets.length > 0 && forecast?.source !== 'developing') {
      const lastPivot = projFrom.pivots[projFrom.pivots.length - 1]
      chart.createOverlay({
        name: 'projectionPath',
        lock: true,
        points: [
          { timestamp: lastPivot.timestamp, value: lastPivot.price },
          ...targets.map((v) => ({ timestamp: lastPivot.timestamp, value: v })),
        ],
        extendData: {
          color: withAlpha(WAVE_COLOR[projFrom.pattern], '99'),
          labels: targets.map((v) => fmtPrice(v)),
        } satisfies ProjectionExtend,
      })
    }

    // Proyección FANTASMA de las ondas que faltan (toggle). Punteada y tenue.
    // Por cada onda se pasan 3 puntos [centro, low, high] (mismo timestamp del
    // origen; la X se reparte en píxeles dentro del overlay).
    if (forecast && forecast.ghosts.length > 0) {
      const pts = [{ timestamp: forecast.fromTimestamp, value: forecast.fromPrice }]
      for (const g of forecast.ghosts) {
        pts.push({ timestamp: forecast.fromTimestamp, value: g.price })
        pts.push({ timestamp: forecast.fromTimestamp, value: g.zone?.low ?? g.price })
        pts.push({ timestamp: forecast.fromTimestamp, value: g.zone?.high ?? g.price })
      }
      chart.createOverlay({
        name: 'waveForecast',
        lock: true,
        points: pts,
        extendData: {
          // Naciente (más especulativo) en rosa, distinto de la VWAP (#c084fc) y del
          // triángulo (#a78bfa) para que no se confunda; en desarrollo, gris pizarra.
          color: forecast.source === 'nascent' ? '#f472b6' : '#94a3b8',
          labels: forecast.ghosts.map((g) => g.label),
          hasZone: forecast.ghosts.map((g) => !!g.zone),
        } satisfies ForecastExtend,
      })
    }

    // Línea de invalidación del escenario primario.
    const primary = scenarios[0]
    const lastTs = primary.pivots[primary.pivots.length - 1]?.timestamp
    chart.createOverlay({
      name: 'priceLine',
      lock: true,
      points: [{ timestamp: lastTs, value: primary.invalidation.price }],
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [drawSig])

  // Auto-encuadre: ajusta zoom/scroll al rango de las ondas dibujadas cada vez que
  // cambian (cambio de par/temporalidad/grado o al aislar un conteo). Así las
  // estructuras quedan siempre bien encuadradas y nunca fuera de la vista.
  // Firma por contenido (índices reales de pivotes), no solo ids: ver drawSig.
  const fitSig = scenarios.map((s) => s.pivots.map((p) => p.index).join(',')).join('|')
  useEffect(() => {
    const chart = chartRef.current
    const el = containerRef.current
    if (!chart || !el || scenarios.length === 0) return
    let i0 = Infinity
    let i1 = -Infinity
    for (const s of scenarios)
      for (const p of s.pivots) {
        if (p.index < i0) i0 = p.index
        if (p.index > i1) i1 = p.index
      }
    if (!Number.isFinite(i0) || !Number.isFinite(i1)) return
    const span = Math.max(1, i1 - i0)
    const barSpace = Math.min(30, Math.max(1.5, (el.clientWidth || 800) / (span * 1.5)))
    chart.setBarSpace(barSpace)
    chart.scrollToDataIndex(i1 + Math.round(span * 0.15))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fitSig])

  // Toggle RSI
  useEffect(() => {
    const chart = chartRef.current
    if (!chart) return
    if (showRsi && !rsiPaneRef.current) {
      rsiPaneRef.current = chart.createIndicator('RSI', false, { height: 90 }) ?? null
    } else if (!showRsi && rsiPaneRef.current) {
      chart.removeIndicator(rsiPaneRef.current, 'RSI')
      rsiPaneRef.current = null
    }
  }, [showRsi])

  // Toggle MACD
  useEffect(() => {
    const chart = chartRef.current
    if (!chart) return
    if (showMacd && !macdPaneRef.current) {
      macdPaneRef.current = chart.createIndicator('MACD', false, { height: 100 }) ?? null
    } else if (!showMacd && macdPaneRef.current) {
      chart.removeIndicator(macdPaneRef.current, 'MACD')
      macdPaneRef.current = null
    }
  }, [showMacd])

  return <div ref={containerRef} className="h-full w-full" />
}
