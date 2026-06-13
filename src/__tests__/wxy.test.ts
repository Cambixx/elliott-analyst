import { describe, it, expect } from 'vitest'
import { detectScenarios } from '@/domain/elliott/detector'
import { waveRelations } from '@/domain/elliott/relations'
import { candlesFromPath } from './helpers'

describe('detección de combinación doble W-X-Y', () => {
  // Corrección bajista neta: W (ABC abajo) + X (conector arriba, parcial) + Y (ABC abajo).
  // path: 100→80→90→70 (W) → 82 (X, retrocede ~0.4 de W) → 62→72→52 (Y ≈ W).
  const path = [100, 80, 90, 70, 82, 62, 72, 52]
  const candles = candlesFromPath(path, 5)
  const { scenarios } = detectScenarios(candles, 1.6)
  const wxy = scenarios.find((s) => s.pattern === 'wxy')

  it('detecta el patrón wxy (correctivo, 8 pivotes, etiquetas W-X-Y)', () => {
    expect(wxy).toBeDefined()
    expect(wxy!.kind).toBe('correction')
    expect(wxy!.pivots.length).toBe(8)
    expect(wxy!.labels.map((l) => l.text)).toEqual(['a', 'b', 'W', 'X', 'a', 'b', 'Y'])
  })

  it('avisa de la ambigüedad y mantiene score en [0,100] e invalidación válida', () => {
    expect(wxy).toBeDefined()
    expect(wxy!.warnings.some((w) => /doble|W-X-Y/i.test(w))).toBe(true)
    expect(wxy!.score).toBeGreaterThanOrEqual(0)
    expect(wxy!.score).toBeLessThanOrEqual(100)
    expect(wxy!.invalidation.price).toBeGreaterThan(0)
  })

  it('pivotes alternantes y crecientes en índice', () => {
    expect(wxy).toBeDefined()
    for (let i = 1; i < wxy!.pivots.length; i++) {
      expect(wxy!.pivots[i].type).not.toBe(wxy!.pivots[i - 1].type)
      expect(wxy!.pivots[i].index).toBeGreaterThan(wxy!.pivots[i - 1].index)
    }
  })

  it('waveRelations devuelve Onda X y Onda Y (sin caer al fallback de 4 pivotes)', () => {
    expect(wxy).toBeDefined()
    const rels = waveRelations(wxy!)
    expect(rels.map((r) => r.label)).toEqual(['Onda X', 'Onda Y'])
  })

  it('si la X supera el origen no se cuenta como wxy', () => {
    // X (5º punto) sube por encima de 100 (origen) → conector inválido.
    const bad = [100, 80, 90, 70, 105, 62, 72, 52]
    const res = detectScenarios(candlesFromPath(bad, 5), 1.6)
    expect(res.scenarios.find((s) => s.pattern === 'wxy')).toBeUndefined()
  })
})
