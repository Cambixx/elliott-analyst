import { describe, it, expect } from 'vitest'
import { runBacktest, degreeList, firstPassage } from '@/domain/elliott/backtest'
import { detectScenariosMultiDegree } from '@/domain/elliott/detector'
import type { Candle } from '@/types/market'

// PRNG determinista (mulberry32): serie reproducible sin Math.random.
function mulberry32(seed: number) {
  let a = seed >>> 0
  return () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function randomWalk(seed: number, n: number): Candle[] {
  const rnd = mulberry32(seed)
  const out: Candle[] = []
  let price = 100
  for (let i = 0; i < n; i++) {
    const drift = (rnd() - 0.5) * 2
    const open = price
    const close = Math.max(1, price + drift)
    const high = Math.max(open, close) + rnd() * 0.4
    const low = Math.min(open, close) - rnd() * 0.4
    out.push({ timestamp: i * 60_000, open, high, low, close, volume: 50 + rnd() * 100, closed: true })
    price = close
  }
  return out
}

/**
 * Regresión de auditoría: la pista A (conteos confirmados) registraba un acierto
 * TRIVIAL (hit con bars=1) cuando un conteo se avistaba por primera vez con el
 * precio YA dentro de su zona objetivo — inflando la tasa del panel de fiabilidad
 * siempre al alza (~6-9 puntos medidos). El guard in-zone (idéntico al de la pista
 * B) debe excluirlos SIN marcar `seen`, para poder medirlos en una evaluación
 * posterior si el precio sale de la zona.
 */
describe('runBacktest — guard in-zone de la pista A', () => {
  it('no registra aciertos triviales con el precio ya dentro de la zona objetivo', () => {
    // Semilla elegida para que la serie produzca avistamientos in-zone (ver aserción
    // de no-vacuidad): con otra semilla el test podría dejar de ejercitar el bug.
    const candles = randomWalk(2, 900)
    const opts = { horizon: 24, maxEvaluations: 120, warmup: 50 }
    const r = runBacktest(candles, 3, opts)

    // Réplica-espejo de la selección de la pista A CON el guard. Si el guard
    // desapareciera de producción, runBacktest registraría también los avistamientos
    // in-zone y la igualdad final fallaría.
    const kList = degreeList(3)
    const n = candles.length
    const step = Math.max(1, Math.ceil((n - opts.horizon - opts.warmup) / opts.maxEvaluations))
    const seen = new Set<string>()
    let expected = 0
    let inZoneSightings = 0
    for (let t = opts.warmup; t < n - opts.horizon; t += step) {
      const prefix = candles.slice(0, t + 1)
      const { scenarios } = detectScenariosMultiDegree(prefix, kList)
      const conf = scenarios.find(
        (x) => !x.developing && x.target && x.pattern !== 'triangulo' && x.pattern !== 'wxy',
      )
      if (!conf?.target || seen.has(conf.id)) continue
      const entry = prefix[prefix.length - 1].close
      if (entry >= conf.target.low && entry <= conf.target.high) {
        inZoneSightings++ // no se marca seen: igual que producción
        continue
      }
      seen.add(conf.id)
      const future = candles.slice(t + 1, t + 1 + opts.horizon)
      if (firstPassage(entry, conf.target, conf.invalidation.price, future)) expected++
    }

    expect(inZoneSightings).toBeGreaterThanOrEqual(1) // la serie ejercita el caso del bug
    expect(r.outcomes.length).toBeGreaterThan(0) // y la pista A no queda vacía (no vacuo)
    expect(r.outcomes.length).toBe(expected)
  })
})
