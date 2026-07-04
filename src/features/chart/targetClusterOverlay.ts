import { registerOverlay } from 'klinecharts'

export interface TargetClusterExtend {
  items: { label: string; count: number }[]
}

/** Índigo, distinto de la VWAP (violeta), S/R (verde/rojo) y las ondas (cyan/ámbar). */
const RGB = '129,140,248'

/**
 * Zonas de CONVERGENCIA de objetivos a ancho completo: dónde apuntan a la vez varios
 * conteos. Cada cluster llega como DOS puntos consecutivos (borde bajo y alto de la zona
 * de intersección): banda índigo rellena + línea central punteada + etiqueta "N conteos".
 * Es geometría compartida, no una probabilidad (el disclaimer vive en el panel).
 */
registerOverlay({
  name: 'targetClusters',
  totalStep: 1,
  needDefaultPointFigure: false,
  needDefaultXAxisFigure: false,
  needDefaultYAxisFigure: false,
  createPointFigures: ({ overlay, coordinates, bounding }) => {
    const ext = overlay.extendData as TargetClusterExtend | undefined
    if (!ext || coordinates.length < 2) return []
    const x2 = (bounding as { width: number }).width
    const figures: unknown[] = []
    for (let i = 0; i + 1 < coordinates.length; i += 2) {
      const item = ext.items[i / 2]
      if (!item) continue
      const yA = coordinates[i].y
      const yB = coordinates[i + 1].y
      const yTop = Math.min(yA, yB)
      const yBot = Math.max(yA, yB)
      const yMid = (yA + yB) / 2
      // Más conteos convergiendo → banda algo más intensa (tope suave).
      const alpha = Math.min(0.22, 0.1 + 0.05 * (item.count - 2))
      if (yBot - yTop >= 1) {
        figures.push({
          type: 'polygon',
          ignoreEvent: true,
          attrs: {
            coordinates: [
              { x: 0, y: yTop },
              { x: x2, y: yTop },
              { x: x2, y: yBot },
              { x: 0, y: yBot },
            ],
          },
          styles: { style: 'fill', color: `rgba(${RGB},${alpha})` },
        })
      }
      figures.push({
        type: 'line',
        ignoreEvent: true,
        attrs: { coordinates: [{ x: 0, y: yMid }, { x: x2, y: yMid }] },
        styles: { color: `rgba(${RGB},0.7)`, size: 1, style: 'dashed', dashedValue: [3, 3] },
      })
      figures.push({
        type: 'text',
        ignoreEvent: true,
        attrs: { x: x2 - 4, y: yMid - 3, text: `⌖ ${item.label}`, align: 'right', baseline: 'bottom' },
        styles: { color: '#1e1b4b', size: 10, backgroundColor: `rgba(${RGB},0.8)`, borderRadius: 2 },
      })
    }
    return figures as never
  },
})
