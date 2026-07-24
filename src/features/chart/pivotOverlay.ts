import { registerOverlay } from 'klinecharts'

/** Datos de los marcadores de pivote (triángulos), alineados 1:1 con los points. */
export interface PivotMarkersExtend {
  types: ('high' | 'low')[]
}

/** Un nivel de pivote ya formateado para dibujar (rayo + etiqueta). */
export interface PivotLevelDraw {
  price: number
  type: 'high' | 'low'
  /** timestamp del pivote de origen: ancla el arranque del rayo. */
  timestamp: number
  label: string
}

export interface PivotLevelsExtend {
  items: PivotLevelDraw[]
}

const HIGH_RGB = '239,68,68' // rojo (máximos)
const LOW_RGB = '34,197,94' // verde (mínimos)

/**
 * TRIÁNGULOS de pivote: uno por cada máximo/mínimo local confirmado. Rojo apuntando hacia
 * abajo justo ENCIMA de los máximos, verde apuntando hacia arriba justo DEBAJO de los
 * mínimos — como el indicador de pivots que dibuja CRECETRADER. Tamaño fijo en píxeles
 * (no escala con el zoom); `ignoreEvent` para no capturar clicks.
 */
registerOverlay({
  name: 'pivotMarkers',
  totalStep: 1,
  needDefaultPointFigure: false,
  needDefaultXAxisFigure: false,
  needDefaultYAxisFigure: false,
  createPointFigures: ({ overlay, coordinates }) => {
    const ext = overlay.extendData as PivotMarkersExtend | undefined
    if (!ext) return []
    const figures: unknown[] = []
    for (let i = 0; i < coordinates.length; i++) {
      const type = ext.types[i]
      if (!type) continue
      const { x, y } = coordinates[i]
      const rgb = type === 'high' ? HIGH_RGB : LOW_RGB
      // Máximo: triángulo ▼ encima de la vela (apunta hacia abajo, al high).
      // Mínimo: triángulo ▲ debajo de la vela (apunta hacia arriba, al low).
      const tip = type === 'high' ? y - 4 : y + 4
      const base = type === 'high' ? y - 11 : y + 11
      figures.push({
        type: 'polygon',
        ignoreEvent: true,
        attrs: {
          coordinates: [
            { x: x - 4, y: base },
            { x: x + 4, y: base },
            { x, y: tip },
          ],
        },
        styles: { style: 'fill', color: `rgb(${rgb})` },
      })
    }
    return figures as never
  },
})

/**
 * NIVELES de pivote: rayo horizontal fino y gris desde el pivote de origen hacia la derecha
 * (proyección del swing como S/R vigente) + etiqueta con el precio junto al eje. Son los
 * "precios calculados" que dibuja CRECETRADER: no una señal, solo geometría de swings
 * recientes. Cada nivel llega como UN punto (timestamp del pivote, precio); la X de origen
 * la da ese punto y la línea se extiende hasta el borde derecho del panel.
 */
registerOverlay({
  name: 'pivotLevels',
  totalStep: 1,
  needDefaultPointFigure: false,
  needDefaultXAxisFigure: false,
  needDefaultYAxisFigure: false,
  createPointFigures: ({ overlay, coordinates, bounding }) => {
    const ext = overlay.extendData as PivotLevelsExtend | undefined
    if (!ext) return []
    const width = (bounding as { width: number }).width
    const figures: unknown[] = []
    for (let i = 0; i < coordinates.length; i++) {
      const item = ext.items[i]
      if (!item) continue
      const { x, y } = coordinates[i]
      const x1 = Math.max(0, x) // si el pivote quedó fuera por la izquierda, arranca en el borde
      figures.push({
        type: 'line',
        ignoreEvent: true,
        attrs: { coordinates: [{ x: x1, y }, { x: width, y }] },
        styles: { color: 'rgba(148,163,184,0.5)', size: 1, style: 'solid' },
      })
      // Etiqueta en el borde DERECHO, junto al eje: es el look de CRECETRADER (precios
      // pegados al eje) y es COMPLEMENTARIO a los S/R de zona de srOverlay, que van a la
      // izquierda. Con varias capas de la derecha activas a la vez (Fibonacci/convergencia)
      // y precios coincidentes puede haber solape puntual, pero el fondo opaco las hace
      // legibles (una ocluye a la otra, no se corrompen).
      figures.push({
        type: 'text',
        ignoreEvent: true,
        attrs: { x: width - 4, y: y - 2, text: item.label, align: 'right', baseline: 'bottom' },
        styles: {
          color: 'rgba(203,213,225,0.9)',
          size: 10,
          backgroundColor: 'rgba(15,23,42,0.7)',
          borderRadius: 2,
          paddingLeft: 3,
          paddingRight: 3,
        },
      })
    }
    return figures as never
  },
})
