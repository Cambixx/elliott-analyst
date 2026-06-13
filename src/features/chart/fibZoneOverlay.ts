import { registerOverlay } from 'klinecharts'

export interface FibZoneExtend {
  /** Etiquetas alineadas a los puntos de nivel (desde el índice 2 en adelante). */
  labels: string[]
  broken: boolean
}

/**
 * Overlay de la zona de retroceso de Fibonacci proyectada: una banda dorada
 * resaltada + líneas de nivel, recoloreadas según esté intacta (verde) o rota (rojo).
 * Puntos esperados: [0]=banda arriba (fromTs), [1]=banda abajo (toTs), [2..]=niveles (fromTs).
 */
registerOverlay({
  name: 'fibZone',
  totalStep: 1,
  needDefaultPointFigure: false,
  needDefaultXAxisFigure: false,
  needDefaultYAxisFigure: false,
  createPointFigures: ({ overlay, coordinates, bounding }) => {
    const ext = overlay.extendData as FibZoneExtend | undefined
    if (!ext || coordinates.length < 3) return []

    const broken = ext.broken
    const line = broken ? 'rgba(239,68,68,0.55)' : 'rgba(34,197,94,0.55)'
    const fill = broken ? 'rgba(239,68,68,0.10)' : 'rgba(34,197,94,0.10)'
    const textColor = broken ? '#fca5a5' : '#86efac'

    // Ancho completo del panel (las líneas/banda de Fibonacci son horizontales,
    // así siempre se ven, independientemente de dónde acabó el impulso).
    const x1 = 0
    const x2 = (bounding as { width: number }).width
    const yTop = coordinates[0].y
    const yBot = coordinates[1].y

    const figures = [
      {
        type: 'polygon',
        ignoreEvent: true,
        attrs: {
          coordinates: [
            { x: x1, y: yTop },
            { x: x2, y: yTop },
            { x: x2, y: yBot },
            { x: x1, y: yBot },
          ],
        },
        styles: { style: 'fill', color: fill },
      },
    ]

    for (let i = 2; i < coordinates.length; i++) {
      const y = coordinates[i].y
      figures.push({
        type: 'line',
        ignoreEvent: true,
        attrs: { coordinates: [{ x: x1, y }, { x: x2, y }] },
        styles: { color: line, size: 1, style: 'dashed' },
      } as never)
      const label = ext.labels[i - 2]
      if (label) {
        figures.push({
          type: 'text',
          ignoreEvent: true,
          attrs: { x: x2, y: y - 2, text: label, align: 'right', baseline: 'bottom' },
          styles: { color: textColor, size: 10 },
        } as never)
      }
    }

    return figures as never
  },
})
