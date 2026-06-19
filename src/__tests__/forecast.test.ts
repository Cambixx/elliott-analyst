import { describe, it, expect } from 'vitest'
import {
  forecastNascentImpulse,
  forecastFromDeveloping,
  computeForecast,
} from '@/domain/elliott/forecast'
import { mkPivot, mkScenario } from './helpers'

describe('forecastNascentImpulse (0-1-2 → 3?/4?/5?)', () => {
  // Impulso alcista naciente: 100 →(1)→ 120 →(2, en curso)→ 108. ret2 = 0.6.
  const up = [mkPivot(0, 100, 'low'), mkPivot(10, 120, 'high'), mkPivot(20, 108, 'low', false)]

  it('proyecta las tres ondas que faltan con sus zonas', () => {
    const f = forecastNascentImpulse(up)
    expect(f).not.toBeNull()
    expect(f!.source).toBe('nascent')
    expect(f!.dir).toBe('up')
    expect(f!.ghosts.map((g) => g.label)).toEqual(['3?', '4?', '5?'])
    // Onda 3 ≈ 1.618×onda1 (w1=20) desde el fin de la 2 (108): 108 + 32.36 ≈ 140.36.
    expect(f!.ghosts[0].price).toBeCloseTo(140.36, 1)
    expect(f!.ghosts[0].zone).toBeDefined()
    // Origen de la polilínea = último pivote real (la onda 2 en curso).
    expect(f!.fromPrice).toBe(108)
  })

  it('la onda 4 proyectada NO solapa el territorio de la onda 1 (regla cardinal)', () => {
    const f = forecastNascentImpulse(up)!
    const w4 = f.ghosts.find((g) => g.label === '4?')!
    expect(w4.price).toBeGreaterThanOrEqual(120) // P1 (fin de onda 1)
  })

  it('espejo bajista', () => {
    const down = [mkPivot(0, 100, 'high'), mkPivot(10, 80, 'low'), mkPivot(20, 92, 'high', false)]
    const f = forecastNascentImpulse(down)
    expect(f!.dir).toBe('down')
    expect(f!.ghosts[0].price).toBeLessThan(92) // la 3 va a la baja
  })

  it('onda 2 ya CONFIRMADA → null (anti-repaint: solo si está en curso)', () => {
    const confirmed = [mkPivot(0, 100, 'low'), mkPivot(10, 120, 'high'), mkPivot(20, 108, 'low', true)]
    expect(forecastNascentImpulse(confirmed)).toBeNull()
  })

  it('retroceso fuera de 0.382–0.886 → null', () => {
    // ret2 = 0.95 (demasiado profundo).
    const deep = [mkPivot(0, 100, 'low'), mkPivot(10, 120, 'high'), mkPivot(20, 101, 'low', false)]
    expect(forecastNascentImpulse(deep)).toBeNull()
  })

  it('la onda 2 rompe el origen → null', () => {
    const broken = [mkPivot(0, 100, 'low'), mkPivot(10, 120, 'high'), mkPivot(20, 99, 'low', false)]
    expect(forecastNascentImpulse(broken)).toBeNull()
  })
})

describe('forecastFromDeveloping', () => {
  it('impulso en desarrollo → 5? + corrección A?/C?, con zona en la 5', () => {
    const s = mkScenario({
      kind: 'impulse',
      pattern: 'impulso',
      direction: 'up',
      developing: true,
      target: { label: 'onda 5', low: 160, high: 180 },
      pivots: [
        mkPivot(0, 100, 'low'),
        mkPivot(10, 130, 'high'),
        mkPivot(20, 115, 'low'),
        mkPivot(30, 150, 'high'),
        mkPivot(40, 140, 'low'),
        mkPivot(50, 158, 'high', false),
      ],
    })
    const f = forecastFromDeveloping(s)!
    expect(f.source).toBe('developing')
    expect(f.ghosts.map((g) => g.label)).toEqual(['5?', 'A?', 'C?'])
    expect(f.ghosts[0].price).toBeCloseTo(170) // centro del target
    expect(f.ghosts[0].zone).toEqual(s.target)
  })

  it('corrección ABC en desarrollo: C? + reanudación 1? en sentido CONTRARIO a la corrección', () => {
    // Corrección bajista (A y C bajan); tras C se reanuda al alza → 1? por ENCIMA de C.
    const down = mkScenario({
      kind: 'correction',
      pattern: 'zigzag',
      direction: 'down',
      developing: true,
      target: { label: 'C', low: 60, high: 70 }, // C ≈ 65
      pivots: [
        mkPivot(0, 100, 'high'),
        mkPivot(10, 75, 'low'),
        mkPivot(20, 88, 'high'),
        mkPivot(30, 70, 'low', false),
      ],
    })
    const f = forecastFromDeveloping(down)!
    expect(f.ghosts.map((g) => g.label)).toEqual(['C?', '1?'])
    const cEnd = f.ghosts[0].price // 65
    const resume = f.ghosts[1].price
    expect(resume).toBeGreaterThan(cEnd) // reanudación al alza (contraria a la corrección bajista)

    // Espejo alcista: 1? por DEBAJO de C.
    const up = mkScenario({
      ...down,
      direction: 'up',
      pivots: [
        mkPivot(0, 60, 'low'),
        mkPivot(10, 90, 'high'),
        mkPivot(20, 72, 'low'),
        mkPivot(30, 95, 'high', false),
      ],
      target: { label: 'C', low: 95, high: 105 },
    })
    const fu = forecastFromDeveloping(up)!
    expect(fu.ghosts[1].price).toBeLessThan(fu.ghosts[0].price)
  })

  it('triángulo o sin target → null', () => {
    const tri = mkScenario({
      kind: 'correction',
      pattern: 'triangulo',
      direction: 'up',
      developing: true,
      target: { label: 't', low: 50, high: 150 },
      pivots: [mkPivot(0, 100, 'low'), mkPivot(10, 120, 'high')],
    })
    expect(forecastFromDeveloping(tri)).toBeNull()
    const noTarget = mkScenario({
      kind: 'impulse',
      pattern: 'impulso',
      direction: 'up',
      developing: true,
      pivots: [mkPivot(0, 100, 'low'), mkPivot(10, 120, 'high')],
    })
    expect(forecastFromDeveloping(noTarget)).toBeNull()
  })

  it('escenario completado (no developing) → null', () => {
    const done = mkScenario({
      kind: 'impulse',
      pattern: 'impulso',
      direction: 'up',
      developing: false,
      target: { label: 'x', low: 100, high: 120 },
      pivots: [mkPivot(0, 100, 'low'), mkPivot(10, 120, 'high')],
    })
    expect(forecastFromDeveloping(done)).toBeNull()
  })
})

describe('computeForecast (precedencia + filtro de marco superior)', () => {
  const developing = mkScenario({
    kind: 'impulse',
    pattern: 'impulso',
    direction: 'up',
    developing: true,
    target: { label: 'onda 5', low: 160, high: 180 },
    pivots: [
      mkPivot(0, 100, 'low'),
      mkPivot(10, 130, 'high'),
      mkPivot(20, 115, 'low'),
      mkPivot(30, 150, 'high'),
      mkPivot(40, 140, 'low'),
      mkPivot(50, 158, 'high', false),
    ],
  })
  const nascentPivots = [mkPivot(0, 100, 'low'), mkPivot(10, 120, 'high'), mkPivot(20, 108, 'low', false)]

  it('prefiere el conteo en desarrollo sobre el naciente', () => {
    const f = computeForecast([developing], nascentPivots, 'mixto')
    expect(f!.source).toBe('developing')
  })

  it('naciente solo si va A FAVOR del marco superior', () => {
    // Sin developing, impulso naciente alcista: se proyecta solo si el marco es alcista.
    expect(computeForecast([], nascentPivots, 'alcista')!.source).toBe('nascent')
    expect(computeForecast([], nascentPivots, 'bajista')).toBeNull()
    expect(computeForecast([], nascentPivots, 'mixto')).toBeNull()
  })

  it('nada aplicable → null', () => {
    expect(computeForecast([], [mkPivot(0, 100, 'low')], 'alcista')).toBeNull()
  })
})
