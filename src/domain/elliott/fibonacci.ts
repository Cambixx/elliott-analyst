/**
 * Puntuación gaussiana de cercanía a uno de varios ratios de Fibonacci "ideales".
 * Devuelve 1 si coincide exactamente, decae suavemente con la distancia.
 * Fibonacci es una GUÍA (scoring suave), nunca un filtro binario.
 */
export function fibScore(observed: number, ideals: readonly number[], sigma = 0.09): number {
  if (!Number.isFinite(observed)) return 0
  const d = Math.min(...ideals.map((i) => Math.abs(observed - i)))
  return Math.exp(-((d / sigma) ** 2))
}

/** Ratios de referencia por relación de ondas (Frost & Prechter, ajustados a cripto). */
export const FIB_IDEALS = {
  wave2Retrace: [0.5, 0.618, 0.786],
  wave3Extension: [1.618, 2.618],
  wave4Retrace: [0.236, 0.382, 0.5],
  wave5: [0.618, 1.0],
  bRetrace: [0.5, 0.618, 0.786],
  cExtension: [0.618, 1.0, 1.618],
} as const
