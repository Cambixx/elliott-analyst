import type { PriceZone, Scenario } from './types'
import type { WaveForecast } from './forecast'
import { projectionTargets } from './projection'

/** Zona de precio donde CONVERGEN varios conteos distintos (geometría compartida). */
export interface TargetCluster {
  /** La ZONA común (intersección real de las bandas que convergen). */
  zone: PriceZone
  /** Nº de conteos DISTINTOS que apuntan a esta zona (≥2). */
  count: number
  /** Etiquetas de los patrones que convergen (para el detalle). */
  sources: string[]
}

/** Convergencia exige al menos DOS conteos distintos (definicional, no un umbral libre). */
const MIN_SOURCES = 2
/** Tope de presentación (coincide con los top-3 escenarios). */
const TOP_N = 3

interface RawZone {
  low: number
  high: number
  sourceId: string
  label: string
}

/**
 * Zonas de CONVERGENCIA de objetivos: dónde apuntan a la vez varios de los conteos
 * dibujados. Toma las zonas ya proyectadas (s.target o los imanes de projectionTargets;
 * y las bandas de un forecast naciente), las agrupa por INTERSECCIÓN real (sin tolerancia
 * ni KDE) y cuenta cuántos conteos DISTINTOS caen en cada zona. Es geometría compartida
 * (los conteos comparten pivotes y ratios Fibonacci), NO confirmación independiente ni
 * probabilidad. No toca el score. Sin look-ahead: opera sobre escenarios ya construidos
 * con velas cerradas.
 */
export function computeTargetClusters(
  scenarios: Scenario[],
  forecast?: WaveForecast | null,
): TargetCluster[] {
  // 1) Recolecta zonas candidatas (una fuente por escenario para no doble-contar).
  const zones: RawZone[] = []
  for (const s of scenarios) {
    if (s.target) {
      zones.push({ low: s.target.low, high: s.target.high, sourceId: s.id, label: s.pattern })
    } else {
      // Sin target: los imanes de proyección (bordes/origen) como zonas degeneradas.
      for (const p of projectionTargets(s)) {
        if (p > 0) zones.push({ low: p, high: p, sourceId: s.id, label: s.pattern })
      }
    }
  }
  // Bandas del forecast NACIENTE (un 0-1-2 es una estructura distinta que también apunta).
  // El 'developing' se omite: su primera banda ya es s.target del primario (mismo sourceId).
  if (forecast && forecast.source === 'nascent') {
    for (const g of forecast.ghosts) {
      if (g.zone) zones.push({ low: g.zone.low, high: g.zone.high, sourceId: 'nascent', label: '0-1-2 naciente' })
    }
  }
  if (zones.length < MIN_SOURCES) return []

  // 2) Barrido de puntos (sweep) sobre los BORDES y los puntos medios entre ellos: en cada
  // punto se cuentan los sourceIds DISTINTOS que lo cubren. Un agrupado voraz de una pasada
  // "consumía" una zona ancha en el primer cluster y perdía convergencias solapadas
  // disjuntas (p.ej. A(100,130) converge con B en [100,105] Y con C en [125,130]); el sweep
  // deja que una zona ancha participe en varios clusters. Maneja también zonas degeneradas
  // (imanes [p,p]) que coinciden en el mismo precio o caen dentro de otra banda.
  const bounds = [...new Set(zones.flatMap((z) => [z.low, z.high]))].sort((a, b) => a - b)
  const testPoints: number[] = []
  for (let i = 0; i < bounds.length; i++) {
    testPoints.push(bounds[i])
    if (i + 1 < bounds.length) testPoints.push((bounds[i] + bounds[i + 1]) / 2)
  }
  const coverAt = (t: number) => {
    const cover = zones.filter((z) => z.low <= t && t <= z.high)
    return { ids: new Set(cover.map((z) => z.sourceId)), labels: new Set(cover.map((z) => z.label)) }
  }
  const sampled = testPoints.map((t) => ({ t, ...coverAt(t) }))

  // 3-4) Cada TRAMO MÁXIMO donde ≥2 sourceIds coexisten es un cluster; su zona es el
  // sub-tramo donde el nº de conteos es MÁXIMO (la convergencia más fuerte y precisa).
  const clusters: TargetCluster[] = []
  let i = 0
  while (i < sampled.length) {
    if (sampled[i].ids.size < MIN_SOURCES) {
      i++
      continue
    }
    let j = i
    while (j + 1 < sampled.length && sampled[j + 1].ids.size >= MIN_SOURCES) j++
    const run = sampled.slice(i, j + 1)
    const maxCount = Math.max(...run.map((r) => r.ids.size))
    const peak = run.filter((r) => r.ids.size === maxCount)
    const low = Math.min(...peak.map((r) => r.t))
    const high = Math.max(...peak.map((r) => r.t))
    const labels = new Set<string>()
    for (const r of peak) for (const l of r.labels) labels.add(l)
    clusters.push({ zone: { label: `${maxCount} conteos`, low, high }, count: maxCount, sources: [...labels] })
    i = j + 1
  }

  // 5) Rankea: más conteos primero; a igualdad, la zona más ESTRECHA (más precisa).
  clusters.sort((a, b) => b.count - a.count || a.zone.high - a.zone.low - (b.zone.high - b.zone.low))
  return clusters.slice(0, TOP_N)
}
