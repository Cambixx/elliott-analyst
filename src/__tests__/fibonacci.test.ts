import { describe, it, expect } from 'vitest'
import { fibScore, FIB_IDEALS } from '@/domain/elliott/fibonacci'

describe('fibScore (sigma adaptativo)', () => {
  it('coincidencia exacta con un ideal → 1', () => {
    expect(fibScore(0.618, [0.382, 0.5, 0.618])).toBeCloseTo(1)
    expect(fibScore(2.0, [1.618, 2.0, 2.618])).toBeCloseTo(1)
  })

  it('valor no finito → 0', () => {
    expect(fibScore(NaN, [0.618])).toBe(0)
  })

  it('extensiones: campana MÁS ANCHA da crédito parcial donde el sigma fijo daba ~0', () => {
    // 1.8 entre 1.618 y 2.0. Con sigma adaptativo (0.16) recibe crédito apreciable;
    // con el viejo sigma fijo 0.09 habría sido casi 0.
    const adaptive = fibScore(1.8, [1.618, 2.0, 2.618])
    const oldFixed = fibScore(1.8, [1.618, 2.0, 2.618], 0.09)
    expect(adaptive).toBeGreaterThan(0.2)
    expect(adaptive).toBeGreaterThan(oldFixed)
  })

  it('retrocesos: campana más estrecha (0–1) que las extensiones', () => {
    // A igual distancia (0.1), un retroceso puntúa MENOS que una extensión,
    // porque su sigma es más estrecho (ideales densos).
    const retr = fibScore(0.7, [0.6]) // dist 0.1, escala <1 → sigma 0.075
    const ext = fibScore(1.7, [1.6]) // dist 0.1, escala >1 → sigma 0.16
    expect(ext).toBeGreaterThan(retr)
  })

  it('los ideales incluyen las mejoras (0.382 en onda 2, 2.0 en onda 3)', () => {
    expect(FIB_IDEALS.wave2Retrace).toContain(0.382)
    expect(FIB_IDEALS.wave3Extension).toContain(2.0)
  })
})
