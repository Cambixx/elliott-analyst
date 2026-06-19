/**
 * Puntuación gaussiana de cercanía a uno de varios ratios de Fibonacci "ideales".
 * Devuelve 1 si coincide exactamente, decae suavemente con la distancia.
 * Fibonacci es una GUÍA (scoring suave), nunca un filtro binario.
 *
 * El `sigma` (ancho de la campana) es ADAPTATIVO a la escala de los ideales: los
 * retrocesos viven en 0–1 (ideales densos → campana estrecha 0.075), mientras que
 * las extensiones son >1 con saltos mayores (1.618→2.618 → campana más ancha 0.16).
 * Un sigma fijo de 0.09 castigaba casi a cero una extensión de 2.0 frente a 1.618.
 */
export function fibScore(observed: number, ideals: readonly number[], sigma?: number): number {
  if (!Number.isFinite(observed)) return 0
  const s = sigma ?? (ideals.some((i) => Math.abs(i) > 1) ? 0.16 : 0.075)
  const d = Math.min(...ideals.map((i) => Math.abs(observed - i)))
  return Math.exp(-((d / s) ** 2))
}

/** Ratios de referencia por relación de ondas (Frost & Prechter, ajustados a cripto). */
export const FIB_IDEALS = {
  wave2Retrace: [0.382, 0.5, 0.618, 0.786], // 0.382 es común en cripto (ondas 2 poco profundas)
  wave3Extension: [1.618, 2.0, 2.618], // 2.0 alinea con la escalera de extensión del detector
  wave4Retrace: [0.236, 0.382, 0.5],
  wave5: [0.618, 1.0],
  bRetrace: [0.5, 0.618, 0.786],
  cExtension: [0.618, 1.0, 1.618],
} as const
