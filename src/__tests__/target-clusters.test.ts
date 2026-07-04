import { describe, it, expect } from 'vitest'
import { computeTargetClusters } from '@/domain/elliott/targetClusters'
import { mkPivot, mkScenario } from './helpers'
import type { Scenario } from '@/domain/elliott/types'

const withTarget = (id: string, low: number, high: number): Scenario =>
  mkScenario({
    id,
    kind: 'impulse',
    pattern: 'impulso',
    direction: 'up',
    pivots: [mkPivot(0, 100, 'low'), mkPivot(10, 130, 'high')],
    target: { label: 'z', low, high },
  })

describe('computeTargetClusters', () => {
  it('agrupa por INTERSECCIÓN real y cuenta conteos distintos (≥2)', () => {
    const clusters = computeTargetClusters([
      withTarget('a', 100, 110),
      withTarget('b', 105, 115), // solapa [105,110] con a
      withTarget('c', 200, 210), // aislado → no converge
    ])
    expect(clusters).toHaveLength(1)
    expect(clusters[0].count).toBe(2)
    expect(clusters[0].zone.low).toBe(105) // intersección: max(low)
    expect(clusters[0].zone.high).toBe(110) // intersección: min(high)
    expect(clusters[0].zone.label).toBe('2 conteos')
  })

  it('zonas que NO se intersecan no forman cluster', () => {
    const clusters = computeTargetClusters([withTarget('a', 100, 110), withTarget('b', 120, 130)])
    expect(clusters).toEqual([])
  })

  it('una zona ANCHA participa en DOS convergencias disjuntas (regresión del voraz)', () => {
    // A(100,130) converge con B en [100,105] Y con C en [125,130]. El agrupado voraz
    // consumía A en el primer cluster y perdía {A,C}; el sweep emite ambos.
    const clusters = computeTargetClusters([
      withTarget('a', 100, 130),
      withTarget('b', 100, 105),
      withTarget('c', 125, 130),
    ])
    expect(clusters).toHaveLength(2)
    const lows = clusters.map((c) => c.zone.low).sort((x, y) => x - y)
    expect(lows).toEqual([100, 125]) // dos zonas de convergencia, no una
    expect(clusters.every((c) => c.count === 2)).toBe(true)
  })

  it('el count refleja el PICO de conteos que coexisten en la zona más estrecha', () => {
    // A ancha cubre [124,126] donde también coexisten D y C → count 3 en esa sub-zona.
    const clusters = computeTargetClusters([
      withTarget('a', 100, 130),
      withTarget('b', 100, 108),
      withTarget('d', 123, 128),
      withTarget('c', 124, 126),
    ])
    expect(clusters[0].count).toBe(3) // el pico va primero
  })

  it('no doble-cuenta el MISMO escenario (dedup por id) — un solo target no converge', () => {
    const clusters = computeTargetClusters([withTarget('a', 100, 110)])
    expect(clusters).toEqual([]) // 1 conteo < MIN_SOURCES
  })

  it('rankea por nº de conteos y limita a top-3', () => {
    const clusters = computeTargetClusters([
      withTarget('a', 100, 110),
      withTarget('b', 100, 110),
      withTarget('c', 100, 110), // zona X: 3 conteos
      withTarget('d', 200, 210),
      withTarget('e', 205, 215), // zona Y: 2 conteos
    ])
    expect(clusters.length).toBeGreaterThanOrEqual(2)
    expect(clusters[0].count).toBe(3) // el más convergido primero
    expect(clusters.length).toBeLessThanOrEqual(3)
  })

  it('incluye las bandas de un forecast NACIENTE como fuente adicional', () => {
    const forecast = {
      source: 'nascent' as const,
      dir: 'up' as const,
      fromPrice: 100,
      fromTimestamp: 0,
      ghosts: [{ label: '3?', price: 108, zone: { label: '3?', low: 104, high: 112 } }],
      warnings: [],
    }
    // Un solo escenario con target [105,110] + la banda naciente [104,112] → convergen.
    const clusters = computeTargetClusters([withTarget('a', 105, 110)], forecast)
    expect(clusters).toHaveLength(1)
    expect(clusters[0].count).toBe(2) // escenario 'a' + 'nascent'
  })
})
