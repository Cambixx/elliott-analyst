import { registerOverlay } from 'klinecharts'

export interface SrItem {
  label: string
  kind: 'soporte' | 'resistencia' | 'en-precio'
  /** Nº de toques del nivel: escala la intensidad visual (más toques → más fuerte). */
  touches: number
}

export interface SrExtend {
  items: SrItem[]
}

/** rgb base por tipo (el alpha se calcula por fuerza). */
const KIND_RGB: Record<SrItem['kind'], string> = {
  soporte: '34,197,94', // verde
  resistencia: '239,68,68', // rojo
  'en-precio': '148,163,184', // gris
}

/** Texto oscuro legible sobre el chip de color de cada tipo. */
const KIND_TEXT: Record<SrItem['kind'], string> = {
  soporte: '#052e16',
  resistencia: '#450a0a',
  'en-precio': '#0f172a',
}

const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x))

/**
 * ZONAS horizontales de soporte/resistencia a ancho completo. Cada nivel llega como
 * DOS puntos consecutivos (borde bajo y alto de la zona = dispersión real de los
 * toques): banda rellena + línea central punteada + etiqueta con precio y nº de
 * toques. La intensidad (alpha/grosor) escala con los toques, para que un nivel
 * tocado 5 veces se distinga de uno tocado 2. Zonas, no precios exactos.
 */
registerOverlay({
  name: 'srLevels',
  totalStep: 1,
  needDefaultPointFigure: false,
  needDefaultXAxisFigure: false,
  needDefaultYAxisFigure: false,
  createPointFigures: ({ overlay, coordinates, bounding }) => {
    const ext = overlay.extendData as SrExtend | undefined
    if (!ext || coordinates.length < 2) return []
    const x2 = (bounding as { width: number }).width
    const figures: unknown[] = []
    for (let i = 0; i + 1 < coordinates.length; i += 2) {
      const item = ext.items[i / 2]
      if (!item) continue
      const rgb = KIND_RGB[item.kind]
      // Fuerza: 2 toques = base; cada toque extra sube la intensidad (con techo).
      const extra = clamp(item.touches - 2, 0, 4)
      const bandAlpha = 0.08 + 0.03 * extra // 0.08 → 0.20
      const lineAlpha = 0.55 + 0.08 * extra // 0.55 → 0.87
      const lineSize = item.touches >= 4 ? 1.5 : 1
      const yA = coordinates[i].y
      const yB = coordinates[i + 1].y
      const yTop = Math.min(yA, yB)
      const yBot = Math.max(yA, yB)
      const yMid = (yA + yB) / 2
      // Banda de la zona (si los toques fueron casi idénticos la banda es fina; la
      // línea central mantiene el nivel visible igualmente).
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
          styles: { style: 'fill', color: `rgba(${rgb},${bandAlpha})` },
        })
      }
      figures.push({
        type: 'line',
        ignoreEvent: true,
        attrs: { coordinates: [{ x: 0, y: yMid }, { x: x2, y: yMid }] },
        styles: { color: `rgba(${rgb},${lineAlpha})`, size: lineSize, style: 'dashed', dashedValue: [4, 4] },
      })
      // Etiqueta en el borde DERECHO (como fibZone): a la izquierda pisaría la
      // leyenda OHLC/MA del pane. Chip con el color del tipo (no el azul default).
      figures.push({
        type: 'text',
        ignoreEvent: true,
        attrs: { x: x2 - 4, y: yMid - 3, text: item.label, align: 'right', baseline: 'bottom' },
        styles: {
          color: KIND_TEXT[item.kind],
          size: 10,
          backgroundColor: `rgba(${rgb},${clamp(0.55 + 0.08 * extra, 0, 0.9)})`,
          borderRadius: 2,
        },
      })
    }
    return figures as never
  },
})
