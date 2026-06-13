import { describe, it, expect } from 'vitest'
import { firstPassage, runBacktest } from '@/domain/elliott/backtest'
import { calibrate, scoreToLikelihood, MIN_CALIBRATION_SAMPLE } from '@/domain/elliott/calibration'
import type { Outcome } from '@/domain/elliott/backtest'
import type { Candle } from '@/types/market'
import { candlesFromPath } from './helpers'

function candle(low: number, high: number): Candle {
  return { timestamp: 0, open: (low + high) / 2, high, low, close: (low + high) / 2, volume: 1, closed: true }
}

describe('firstPassage (anti-look-ahead, núcleo de outcome)', () => {
  const target = { label: 't', low: 120, high: 130 }
  const inv = 90 // invalidación por debajo; entrada 100 → lados opuestos

  it('alcanza el objetivo antes que la invalidación → hit', () => {
    const future = [candle(98, 105), candle(110, 125), candle(115, 122)]
    const r = firstPassage(100, target, inv, future)
    expect(r).toEqual({ hit: true, bars: 2 })
  })

  it('alcanza la invalidación antes que el objetivo → miss', () => {
    const future = [candle(95, 102), candle(85, 92), candle(120, 130)]
    const r = firstPassage(100, target, inv, future)
    expect(r).toEqual({ hit: false, bars: 2 })
  })

  it('no se resuelve dentro del horizonte → null', () => {
    const future = [candle(98, 105), candle(99, 108)]
    expect(firstPassage(100, target, inv, future)).toBeNull()
  })

  it('objetivo e invalidación al mismo lado de la entrada → null (ambiguo)', () => {
    const future = [candle(120, 130)]
    expect(firstPassage(100, target, 110 /* también arriba */, future)).toBeNull()
  })

  it('empate (ambos tocados en la misma vela) se resuelve SIEMPRE como miss', () => {
    // Caso A: invalidación más cercana a la entrada.
    expect(firstPassage(100, target, inv, [candle(85, 135)])).toEqual({ hit: false, bars: 1 })
    // Caso B (antes sesgaba a hit): objetivo MÁS cercano a la entrada, ambos tocados.
    const nearTarget = { label: 't', low: 102, high: 108 } // mid 105, dist 5 < inv dist 10
    expect(firstPassage(100, nearTarget, inv, [candle(80, 103)])).toEqual({ hit: false, bars: 1 })
  })
})

describe('runBacktest', () => {
  it('serie corta → resultado vacío, sin lanzar', () => {
    const r = runBacktest(candlesFromPath([100, 110, 105]), 2)
    expect(r.resolved).toBe(0)
    expect(r.outcomes).toEqual([])
  })

  it('serie larga: produce outcomes bien formados y respeta el tope de evaluaciones', () => {
    // Onda de sierra repetida para generar estructura detectable a lo largo del tiempo.
    const path: number[] = [100]
    for (let i = 0; i < 30; i++) {
      const base = 100 + i * 2
      path.push(base + 20, base + 8, base + 35, base + 22, base + 45, base + 30)
    }
    const r = runBacktest(candlesFromPath(path, 4), 2, { horizon: 20, maxEvaluations: 40 })
    expect(r.evaluated).toBeLessThanOrEqual(40 + 1)
    for (const o of r.outcomes) {
      expect(typeof o.hit).toBe('boolean')
      expect(o.bars).toBeGreaterThan(0)
      expect(o.bars).toBeLessThanOrEqual(20)
      expect(o.score).toBeGreaterThanOrEqual(0)
      expect(o.score).toBeLessThanOrEqual(100)
    }
  })
})

describe('calibrate + scoreToLikelihood', () => {
  const mk = (score: number, hit: boolean, metKeys: string[] = []): Outcome => ({
    score,
    hit,
    bars: 5,
    metKeys,
  })

  it('agrupa por banda y calcula la tasa de acierto', () => {
    const outcomes = [mk(70, true), mk(72, true), mk(68, false), mk(30, false), mk(35, true)]
    const cal = calibrate(outcomes)
    expect(cal.total).toBe(5)
    expect(cal.hits).toBe(3)
    const alta = cal.buckets.find((b) => b.label === 'alta')!
    expect(alta.n).toBe(3)
    expect(alta.hits).toBe(2)
    expect(alta.hitRate).toBeCloseTo(2 / 3)
  })

  it('sin muestra suficiente → término cualitativo, sin frecuencia', () => {
    const cal = calibrate([mk(70, true), mk(68, false)]) // solo 2 en "alta"
    const lk = scoreToLikelihood(70, cal)
    expect(lk.calibrated).toBe(false)
    expect(lk.frequency).toBeNull()
    expect(lk.term).toContain('fuertes')
  })

  it('con muestra suficiente → frecuencia observada y calibrated true', () => {
    const outcomes = Array.from({ length: MIN_CALIBRATION_SAMPLE }, (_, i) => mk(70, i % 2 === 0))
    const cal = calibrate(outcomes)
    const lk = scoreToLikelihood(70, cal)
    expect(lk.calibrated).toBe(true)
    expect(lk.frequency).toEqual({ hits: Math.ceil(MIN_CALIBRATION_SAMPLE / 2), total: MIN_CALIBRATION_SAMPLE })
  })

  it('factorStats: calcula el lift observado por factor (transparencia)', () => {
    // 'div5' presente en 3 aciertos; 'estructura' en todos pero con mezcla.
    const outcomes = [
      mk(70, true, ['div5', 'estructura']),
      mk(60, true, ['div5', 'estructura']),
      mk(55, true, ['div5', 'estructura']),
      mk(40, false, ['estructura']),
      mk(35, false, ['estructura']),
    ]
    const cal = calibrate(outcomes)
    const div5 = cal.factorStats.find((f) => f.key === 'div5')!
    const estructura = cal.factorStats.find((f) => f.key === 'estructura')!
    expect(div5.metN).toBe(3)
    expect(div5.hitRateWhenMet).toBe(1) // 3/3
    expect(estructura.metN).toBe(5)
    expect(estructura.hitRateWhenMet).toBeCloseTo(3 / 5)
    // div5 acompaña a más aciertos que la base → lift positivo y mayor que el de estructura.
    expect(div5.lift).toBeGreaterThan(estructura.lift)
  })

  it('nunca usa porcentaje puntual ni "probable" a secas', () => {
    for (const score of [10, 50, 80]) {
      const lk = scoreToLikelihood(score, null)
      expect(lk.term).not.toMatch(/%/)
      expect(lk.term).not.toMatch(/\bprobable\b/)
    }
  })
})
