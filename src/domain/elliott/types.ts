/** Pivote (swing high/low) detectado por el ZigZag. */
export interface Pivot {
  /** Índice en el array de velas. */
  index: number
  timestamp: number
  price: number
  type: 'high' | 'low'
  /** false en el último pivote provisional (puede repintar al llegar nuevas velas). */
  confirmed: boolean
  /**
   * Marca de baja fiabilidad del pivote (causal, sin look-ahead):
   * - 'wick_spike': formado en una mecha desproporcionada (flash-crash/barrido de stops).
   * - 'low_liquidity': formado con volumen muy por debajo de la mediana reciente.
   */
  flag?: 'wick_spike' | 'low_liquidity'
}

export type Direction = 'up' | 'down'
export type ScenarioKind = 'impulse' | 'correction'
export type Confidence = 'baja' | 'media' | 'alta'

/** Patrón concreto detectado (define color y narrativa). */
export type ScenarioPattern = 'impulso' | 'diagonal' | 'zigzag' | 'flat' | 'triangulo' | 'wxy'

/** Zona de precio (objetivo o invalidación expresada como rango). */
export interface PriceZone {
  label: string
  low: number
  high: number
}

/** Etiqueta de onda anclada a un pivote (para dibujar el número/letra). */
export interface WaveLabel {
  text: string
  timestamp: number
  price: number
  /** true → colocar la etiqueta por encima del pivote (highs); false → por debajo. */
  above: boolean
}

/** Un factor del score de confluencia (indicador que confirma o no el conteo). */
export interface ConfluenceFactor {
  key: string
  label: string
  met: boolean
  detail?: string
  /**
   * Peso del factor en el score ponderado (default 1). Los factores tautológicos
   * (p.ej. "estructura", siempre true) pesan menos; los más informativos
   * (divergencia RSI en onda 5, pico de MACD en onda 3) pesan más.
   */
  weight?: number
}

/** Resultado del score de confluencia: cuántos factores confirman el conteo. */
export interface Confluence {
  score: number
  max: number
  factors: ConfluenceFactor[]
}

/** Un escenario de conteo de Elliott: hipótesis ranqueada, nunca una certeza. */
export interface Scenario {
  id: string
  kind: ScenarioKind
  pattern: ScenarioPattern
  direction: Direction
  title: string
  /** Pivotes que componen el conteo (P0..P5 impulso / P0..P3 corrección). */
  pivots: Pivot[]
  /** Etiquetas alineadas a los pivotes (sin la del origen P0). */
  labels: WaveLabel[]
  score: number // 0..100 (mezcla de estructura/Fibonacci y confluencia)
  confidence: Confidence
  confluence: Confluence
  developing: boolean
  invalidation: { price: number; reason: string }
  target?: PriceZone
  narrative: string
  warnings: string[]
}
