import { registerOverlay } from 'klinecharts'

export interface SrItem {
  label: string
  kind: 'soporte' | 'resistencia' | 'en-precio'
}

export interface SrExtend {
  items: SrItem[]
}

const KIND_COLOR: Record<SrItem['kind'], string> = {
  soporte: 'rgba(34,197,94,0.45)', // verde
  resistencia: 'rgba(239,68,68,0.45)', // rojo
  'en-precio': 'rgba(148,163,184,0.45)', // gris
}

/**
 * Niveles horizontales de soporte/resistencia: una línea a ancho completo por nivel
 * (coloreada según esté por debajo=soporte / por encima=resistencia del precio),
 * con su etiqueta. Cada punto del overlay aporta la `y` (precio del nivel).
 */
registerOverlay({
  name: 'srLevels',
  totalStep: 1,
  needDefaultPointFigure: false,
  needDefaultXAxisFigure: false,
  needDefaultYAxisFigure: false,
  createPointFigures: ({ overlay, coordinates, bounding }) => {
    const ext = overlay.extendData as SrExtend | undefined
    if (!ext || coordinates.length === 0) return []
    const x2 = (bounding as { width: number }).width
    const figures: unknown[] = []
    coordinates.forEach((c, i) => {
      const item = ext.items[i]
      if (!item) return
      const color = KIND_COLOR[item.kind]
      figures.push({
        type: 'line',
        ignoreEvent: true,
        attrs: { coordinates: [{ x: 0, y: c.y }, { x: x2, y: c.y }] },
        styles: { color, size: 1, style: 'dashed', dashedValue: [2, 4] },
      })
      figures.push({
        type: 'text',
        ignoreEvent: true,
        attrs: { x: 4, y: c.y - 2, text: item.label, align: 'left', baseline: 'bottom' },
        styles: { color, size: 9 },
      })
    })
    return figures as never
  },
})
