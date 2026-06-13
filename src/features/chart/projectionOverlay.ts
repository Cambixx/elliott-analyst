import { registerOverlay } from 'klinecharts'

export interface ProjectionExtend {
  color: string
  /** Etiquetas alineadas a los puntos objetivo (desde el índice 1). */
  labels: string[]
}

/**
 * Proyección del escenario más probable: líneas discontinuas desde el último
 * pivote hacia sus objetivos (hipótesis visual, no predicción). Puntos:
 * [0] = origen (último pivote), [1..] = objetivos (mismo timestamp; la X final
 * se desplaza unos px a la derecha porque KLineChart no mapea bien timestamps futuros).
 */
registerOverlay({
  name: 'projectionPath',
  totalStep: 1,
  needDefaultPointFigure: false,
  needDefaultXAxisFigure: false,
  needDefaultYAxisFigure: false,
  createPointFigures: ({ overlay, coordinates, bounding }) => {
    const ext = overlay.extendData as ProjectionExtend | undefined
    if (!ext || coordinates.length < 2) return []

    const origin = coordinates[0]
    const width = (bounding as { width: number }).width
    const dx = Math.max(30, Math.min(90, width - origin.x - 14))
    // El extremo nunca se sale del panel (el pivote suele estar pegado al borde derecho).
    const ex = Math.min(origin.x + dx, width - 8)

    const figures: unknown[] = []
    for (let i = 1; i < coordinates.length; i++) {
      const y = coordinates[i].y
      figures.push({
        type: 'line',
        ignoreEvent: true,
        attrs: {
          coordinates: [
            { x: origin.x, y: origin.y },
            { x: ex, y },
          ],
        },
        styles: { style: 'dashed', dashedValue: [4, 4], color: ext.color, size: 1.5 },
      })
      figures.push({
        type: 'circle',
        ignoreEvent: true,
        attrs: { x: ex, y, r: 2.5 },
        styles: { style: 'fill', color: ext.color },
      })
      const label = ext.labels[i - 1]
      if (label) {
        // Si el texto no cabe a la derecha del punto, se dibuja a su izquierda
        // (alineado a la derecha y un pelín por encima para no pisar la línea).
        const textWidth = label.length * 5.5
        const overflows = ex + 4 + textWidth > width
        figures.push({
          type: 'text',
          ignoreEvent: true,
          attrs: {
            x: overflows ? ex - 4 : ex + 4,
            y: overflows ? y - 4 : y,
            text: label,
            align: overflows ? 'right' : 'left',
            baseline: overflows ? 'bottom' : 'middle',
          },
          styles: { color: ext.color, size: 9 },
        })
      }
    }
    return figures as never
  },
})
