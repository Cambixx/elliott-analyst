import { registerOverlay } from 'klinecharts'

/** Datos que adjuntamos al overlay para dibujar las etiquetas de onda. */
export interface ElliottExtend {
  labels: { text: string; above: boolean }[]
  color: string
  /** Grosor de la polilínea (el primario más grueso que los alternativos). */
  size?: number
  /** true en escenarios alternativos: el color lleva alpha y la etiqueta usa texto claro. */
  faded?: boolean
}

/**
 * Overlay personalizado que dibuja la polilínea del conteo de ondas
 * (1-2-3-4-5 / A-B-C) con un círculo y una etiqueta en cada pivote.
 * Se registra una sola vez al importar este módulo.
 */
registerOverlay({
  name: 'elliottWave',
  totalStep: 1,
  needDefaultPointFigure: false,
  needDefaultXAxisFigure: false,
  needDefaultYAxisFigure: false,
  createPointFigures: ({ overlay, coordinates }) => {
    const ext = overlay.extendData as ElliottExtend | undefined
    const color = ext?.color ?? '#22d3ee'
    const labels = ext?.labels ?? []
    const size = ext?.size ?? 2
    if (coordinates.length < 2) return []

    const figures = [
      {
        type: 'line',
        ignoreEvent: true,
        attrs: { coordinates },
        styles: { color, size },
      },
    ]

    coordinates.forEach((c, i) => {
      figures.push({
        type: 'circle',
        ignoreEvent: true,
        attrs: { x: c.x, y: c.y, r: size >= 2 ? 3 : 2 },
        // styles cast a any porque circle usa { style, color }
        styles: { style: 'fill', color } as never,
      } as never)

      // El primer punto es el origen (P0): no lleva etiqueta numérica.
      const label = labels[i - 1]
      if (i > 0 && label) {
        const above = label.above
        figures.push({
          type: 'text',
          ignoreEvent: true,
          attrs: {
            x: c.x,
            y: above ? c.y - 18 : c.y + 6,
            text: label.text,
            align: 'center',
            baseline: 'top',
          },
          styles: {
            color: ext?.faded ? '#cbd5e1' : '#0b1220',
            backgroundColor: color,
            size: ext?.faded ? 10 : 11,
            weight: 'bold',
            paddingLeft: 5,
            paddingRight: 5,
            paddingTop: 2,
            paddingBottom: 2,
            borderRadius: 4,
          },
        } as never)
      }
    })

    return figures as never
  },
})
