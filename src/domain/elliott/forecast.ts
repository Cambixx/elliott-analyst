import type { Bias } from '@/domain/indicators/trend'
import type { Direction, Pivot, PriceZone, Scenario } from './types'

/** Valor con signo según dirección (igual convención que el detector/canal). */
const sval = (price: number, dir: Direction) => (dir === 'up' ? price : -price)

/** Zona de precio saneada: low ≥ 0, high = mayor de los dos. */
const zone = (a: number, b: number): PriceZone => ({
  label: '',
  low: Math.max(Math.min(a, b), 0),
  high: Math.max(a, b),
})

export interface GhostWave {
  /** Etiqueta con interrogante: '3?', '4?', '5?', 'A?', 'C?', 'Y?', 'rev?', '1?'. */
  label: string
  /** Precio central proyectado (vértice de la polilínea fantasma). */
  price: number
  /** Banda Fibonacci opcional (la onda como ZONA, no precio exacto). */
  zone?: PriceZone
}

export interface WaveForecast {
  /** 'developing' = completar la onda en curso del conteo; 'nascent' = inicio 0-1-2. */
  source: 'developing' | 'nascent'
  dir: Direction
  /** Origen de la polilínea fantasma = último pivote REAL. */
  fromPrice: number
  fromTimestamp: number
  ghosts: GhostWave[]
  warnings: string[]
}

/**
 * Proyecta lo que falta del conteo primario EN DESARROLLO (la onda en curso hasta
 * su objetivo ya calculado, y el movimiento siguiente). Reutiliza el centro de
 * `s.target` (única fuente de verdad: el mismo objetivo que ya se dibuja). Robusto.
 */
export function forecastFromDeveloping(s: Scenario): WaveForecast | null {
  if (!s.developing || !s.target || s.pattern === 'triangulo') return null
  const sign = s.direction === 'up' ? 1 : -1
  const last = s.pivots[s.pivots.length - 1]
  const origin = s.pivots[0].price
  const waveEnd = (s.target.low + s.target.high) / 2 // fin de la onda en curso
  const ghosts: GhostWave[] = []

  if (s.kind === 'impulse') {
    if (s.pattern === 'diagonal') {
      // Onda 5 de la cuña + reversión rápida (1 tramo) tras completarse.
      const range = Math.abs(waveEnd - origin)
      ghosts.push({ label: '5?', price: waveEnd, zone: s.target })
      ghosts.push({ label: 'rev?', price: Math.max(waveEnd - sign * 0.618 * range, 0) })
    } else {
      // Onda 5 + corrección ABC esperada (0.5–0.618 del recorrido), como la rama completada.
      const range = Math.abs(waveEnd - origin)
      ghosts.push({ label: '5?', price: waveEnd, zone: s.target })
      ghosts.push({ label: 'A?', price: Math.max(waveEnd - sign * 0.5 * range, 0) })
      ghosts.push({ label: 'C?', price: Math.max(waveEnd - sign * 0.618 * range, 0) })
    }
  } else {
    // Corrección: completar C / Y; tras ABC, reanudación de la tendencia previa.
    const endLabel = s.pattern === 'wxy' ? 'Y?' : 'C?'
    ghosts.push({ label: endLabel, price: waveEnd, zone: s.target })
    if (s.pattern !== 'wxy') {
      const span = Math.abs(waveEnd - origin)
      // Reanudación CONTRARIA a la corrección (la tendencia previa se reanuda): sign opuesto.
      ghosts.push({ label: '1?', price: Math.max(waveEnd - sign * 0.382 * span, 0) })
    }
  }

  return {
    source: 'developing',
    dir: s.direction,
    fromPrice: last.price,
    fromTimestamp: last.timestamp,
    ghosts: ghosts.filter((g) => g.price > 0),
    warnings: ['Proyección Fibonacci de la onda en curso: hipótesis, puede repintar.'],
  }
}

/**
 * Detector ACOTADO de un impulso NACIENTE (0-1-2 con la onda 2 aún en curso) y
 * proyección de las ondas 3-4-5 que faltan, como zonas Fibonacci. MUY especulativo
 * (un 1-2 es ambiguo): el llamante debe filtrarlo (p.ej. por el marco superior).
 * Reglas duras mínimas análogas a scoreImpulse; nada de esto entra en el ranking.
 */
export function forecastNascentImpulse(pivots: Pivot[]): WaveForecast | null {
  if (pivots.length < 3) return null
  const [P0, P1, P2] = pivots.slice(-3)
  if (P2.confirmed) return null // solo si la onda 2 sigue en curso (anti-repaint)

  const dir: Direction = P1.price > P0.price ? 'up' : 'down'
  const v = (p: Pivot) => sval(p.price, dir)
  const w1 = v(P1) - v(P0)
  if (w1 <= 0) return null
  // La onda 2 retrocede pero no rompe el origen ni excede el final de la onda 1.
  if (v(P2) >= v(P1) || v(P2) <= v(P0)) return null
  const ret2 = (v(P1) - v(P2)) / w1
  if (ret2 < 0.382 || ret2 > 0.886) return null

  const sign = dir === 'up' ? 1 : -1
  // Onda 3: zona 1.618–2.618×onda1 desde el fin de la 2; centro 1.618 (dominante en cripto).
  const p3lo = P2.price + sign * 1.618 * w1
  const p3hi = P2.price + sign * 2.618 * w1
  const p3star = P2.price + sign * 1.618 * w1
  const w3 = 1.618 * w1
  // Onda 4: retroceso 0.382 de la 3 proyectada, SIN solapar la onda 1 (regla cardinal 3).
  let p4 = p3star - sign * 0.382 * w3
  p4 = dir === 'up' ? Math.max(p4, P1.price) : Math.min(p4, P1.price)
  // Onda 5: igualdad con onda 1 y 0.618×(onda1+onda3).
  const p5a = p4 + sign * w1
  const p5b = p4 + sign * 0.618 * (w1 + w3)

  const all: GhostWave[] = []
  if (Math.max(p3lo, p3hi) > 0) all.push({ label: '3?', price: p3star, zone: zone(p3lo, p3hi) })
  if (p4 > 0) all.push({ label: '4?', price: p4 })
  all.push({ label: '5?', price: (p5a + p5b) / 2, zone: zone(p5a, p5b) })
  // Filtra cualquier vértice con precio central ≤0 (en desplomes la 5 puede salir
  // negativa aunque un borde de su banda sea >0). Coherente con forecastFromDeveloping.
  const ghosts = all.filter((g) => g.price > 0)
  if (ghosts.length === 0) return null

  return {
    source: 'nascent',
    dir,
    fromPrice: P2.price,
    fromTimestamp: P2.timestamp,
    ghosts,
    warnings: [
      'Estructura 0-1-2 naciente: hipótesis MUY especulativa (un 1-2 es ambiguo). Zonas Fibonacci, no precios.',
    ],
  }
}

/** ¿La dirección del impulso naciente va a favor del marco temporal superior? */
function alignedWithHigher(dir: Direction, higherBias: Bias): boolean {
  return (dir === 'up' && higherBias === 'alcista') || (dir === 'down' && higherBias === 'bajista')
}

/**
 * Pronóstico de las ondas que faltan: prioriza el conteo EN DESARROLLO (robusto);
 * si no hay, prueba un impulso NACIENTE 0-1-2 pero SOLO si va a favor del marco
 * superior (reduce el ruido y el sesgo de confirmación). null si nada aplica.
 */
export function computeForecast(
  scenarios: Scenario[],
  pivots: Pivot[],
  higherBias: Bias,
): WaveForecast | null {
  const primary = scenarios[0]
  if (primary) {
    const dev = forecastFromDeveloping(primary)
    if (dev) return dev
  }
  const nascent = forecastNascentImpulse(pivots)
  if (nascent && alignedWithHigher(nascent.dir, higherBias)) return nascent
  return null
}
