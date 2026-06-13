import { describe, it, expect } from 'vitest'
import type { ConfluenceFactor } from '@/domain/elliott/types'

/**
 * Replica el cálculo ponderado de blend() para fijar la semántica de los pesos:
 * un factor tautológico (peso bajo) no debe inflar el score tanto como uno
 * informativo (peso alto).
 */
function weightedConfPct(factors: ConfluenceFactor[]): number {
  let wMet = 0
  let wTotal = 0
  for (const f of factors) {
    const w = f.weight ?? 1
    wTotal += w
    if (f.met) wMet += w
  }
  return wTotal ? (wMet / wTotal) * 100 : 0
}

describe('confluencia ponderada', () => {
  it('cumplir solo el factor tautológico (peso 0.3) puntúa muy poco', () => {
    const factors: ConfluenceFactor[] = [
      { key: 'estructura', label: '', met: true, weight: 0.3 },
      { key: 'div5', label: '', met: false, weight: 1.5 },
      { key: 'macd3', label: '', met: false, weight: 1.5 },
      { key: 'vol', label: '', met: false, weight: 1.2 },
    ]
    expect(weightedConfPct(factors)).toBeLessThan(10)
  })

  it('cumplir los factores informativos puntúa mucho más que solo el tautológico', () => {
    const onlyStructure: ConfluenceFactor[] = [
      { key: 'estructura', label: '', met: true, weight: 0.3 },
      { key: 'div5', label: '', met: false, weight: 1.5 },
      { key: 'macd3', label: '', met: false, weight: 1.5 },
    ]
    const informative: ConfluenceFactor[] = [
      { key: 'estructura', label: '', met: false, weight: 0.3 },
      { key: 'div5', label: '', met: true, weight: 1.5 },
      { key: 'macd3', label: '', met: true, weight: 1.5 },
    ]
    expect(weightedConfPct(informative)).toBeGreaterThan(weightedConfPct(onlyStructure))
  })

  it('peso ausente equivale a 1 (compatibilidad)', () => {
    const factors: ConfluenceFactor[] = [
      { key: 'a', label: '', met: true },
      { key: 'b', label: '', met: false },
    ]
    expect(weightedConfPct(factors)).toBe(50)
  })
})
