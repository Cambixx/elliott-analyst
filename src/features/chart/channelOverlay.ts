import { registerOverlay } from 'klinecharts'

export interface ChannelExtend {
  color: string
}

/**
 * Canal de Elliott (0-2 / 1-3): dos líneas paralelas tenues que encierran el
 * impulso. Cada línea se define por dos puntos (timestamp, value); KLineChart
 * mapea los timestamps a X. Hipótesis estructural, no predicción.
 */
registerOverlay({
  name: 'elliottChannel',
  totalStep: 1,
  needDefaultPointFigure: false,
  needDefaultXAxisFigure: false,
  needDefaultYAxisFigure: false,
  createPointFigures: ({ overlay, coordinates }) => {
    const ext = overlay.extendData as ChannelExtend | undefined
    if (!ext || coordinates.length < 4) return []
    // points: [lower0, lower1, upper0, upper1]
    const seg = (a: number, b: number) => ({
      type: 'line',
      ignoreEvent: true,
      attrs: { coordinates: [coordinates[a], coordinates[b]] },
      styles: { style: 'dashed', dashedValue: [3, 5], color: ext.color, size: 1 },
    })
    return [seg(0, 1), seg(2, 3)] as never
  },
})
