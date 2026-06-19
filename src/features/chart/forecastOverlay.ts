import { registerOverlay } from 'klinecharts'

export interface ForecastExtend {
  color: string
  /** Etiqueta por onda fantasma ('3?', '4?', '5?', …). */
  labels: string[]
  /** Si la onda i lleva banda (zona) o es solo un vértice. */
  hasZone: boolean[]
}

/**
 * Proyección FANTASMA de las ondas que faltan: una polilínea punteada conectada
 * (origen real → 3? → 4? → 5?…) que se extiende a la derecha, con bandas Fibonacci
 * y etiquetas con '?'. Hipótesis, no predicción.
 *
 * KLineChart NO mapea timestamps futuros, así que (como projectionOverlay) TODOS los
 * puntos se pasan con el timestamp del último pivote real y la X se reparte en PÍXELES
 * aquí. Por cada onda se pasan 3 puntos [centro, low, high] para obtener la Y de la banda.
 * points = [origen, c0, lo0, hi0, c1, lo1, hi1, …].
 */
registerOverlay({
  name: 'waveForecast',
  totalStep: 1,
  needDefaultPointFigure: false,
  needDefaultXAxisFigure: false,
  needDefaultYAxisFigure: false,
  createPointFigures: ({ overlay, coordinates, bounding }) => {
    const ext = overlay.extendData as ForecastExtend | undefined
    if (!ext || coordinates.length < 4) return []

    const origin = coordinates[0]
    const width = (bounding as { width: number }).width
    const n = ext.labels.length
    // Repartimos la X disponible a la derecha del origen en n pasos (con tope).
    const avail = width - 8 - origin.x
    const step = Math.max(18, Math.min(70, avail > 0 ? avail / n : 18))

    const figures: unknown[] = []
    let prev = origin
    for (let i = 0; i < n; i++) {
      const base = 1 + i * 3
      const center = coordinates[base]
      const lo = coordinates[base + 1]
      const hi = coordinates[base + 2]
      if (!center) break
      const x = Math.min(origin.x + (i + 1) * step, width - 8)

      // Banda Fibonacci de la onda (si tiene zona y altura apreciable).
      if (ext.hasZone[i] && lo && hi && Math.abs(hi.y - lo.y) > 1) {
        const halfW = Math.min(step / 2, 14)
        figures.push({
          type: 'polygon',
          ignoreEvent: true,
          attrs: {
            coordinates: [
              { x: x - halfW, y: hi.y },
              { x: x + halfW, y: hi.y },
              { x: x + halfW, y: lo.y },
              { x: x - halfW, y: lo.y },
            ],
          },
          styles: { style: 'fill', color: withLowAlpha(ext.color) },
        })
      }

      // Segmento punteado desde el vértice anterior.
      figures.push({
        type: 'line',
        ignoreEvent: true,
        attrs: { coordinates: [{ x: prev.x, y: prev.y }, { x, y: center.y }] },
        styles: { style: 'dashed', dashedValue: [4, 4], color: ext.color, size: 1.3 },
      })
      figures.push({
        type: 'circle',
        ignoreEvent: true,
        attrs: { x, y: center.y, r: 2.5 },
        styles: { style: 'fill', color: ext.color },
      })
      const label = ext.labels[i]
      const textWidth = label.length * 5.5
      const overflows = x + 4 + textWidth > width
      figures.push({
        type: 'text',
        ignoreEvent: true,
        attrs: {
          x: overflows ? x - 4 : x + 4,
          y: center.y - 4,
          text: label,
          align: overflows ? 'right' : 'left',
          baseline: 'bottom',
        },
        styles: { color: ext.color, size: 9 },
      })

      prev = { x, y: center.y } as typeof origin
    }
    return figures as never
  },
})

/** Convierte un color #rrggbbaa o rgba a un relleno muy tenue para las bandas. */
function withLowAlpha(color: string): string {
  if (color.startsWith('#') && color.length >= 7) return color.slice(0, 7) + '1a' // ~10%
  return color
}
