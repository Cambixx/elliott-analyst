import { registerOverlay } from 'klinecharts'

export interface VwapExtend {
  color: string
}

/**
 * VWAP anclado: una polilínea por todos los puntos (uno por vela desde el ancla).
 * KLineChart mapea cada {timestamp, value} a una coordenada; un solo figure `line`
 * dibuja la curva. Se redibuja solo al cambiar el conteo, no en cada tick.
 */
registerOverlay({
  name: 'vwapLine',
  totalStep: 1,
  needDefaultPointFigure: false,
  needDefaultXAxisFigure: false,
  needDefaultYAxisFigure: false,
  createPointFigures: ({ overlay, coordinates }) => {
    const ext = overlay.extendData as VwapExtend | undefined
    if (coordinates.length < 2) return []
    return [
      {
        type: 'line',
        ignoreEvent: true,
        attrs: { coordinates },
        styles: { color: ext?.color ?? '#c084fc', size: 1.5, style: 'dashed', dashedValue: [6, 3] },
      },
    ] as never
  },
})
