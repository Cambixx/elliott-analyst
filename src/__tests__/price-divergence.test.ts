import { describe, it, expect } from 'vitest'
import { priceDivergence } from '@/api/market'

describe('priceDivergence', () => {
  it('precios iguales → 0', () => {
    expect(priceDivergence(100, 100)).toBe(0)
  })

  it('calcula la fracción relativa respecto al precio global', () => {
    expect(priceDivergence(103, 100)).toBeCloseTo(0.03)
    expect(priceDivergence(97, 100)).toBeCloseTo(0.03)
  })

  it('datos faltantes o precio global no positivo → null', () => {
    expect(priceDivergence(null, 100)).toBeNull()
    expect(priceDivergence(100, null)).toBeNull()
    expect(priceDivergence(100, 0)).toBeNull()
    expect(priceDivergence(undefined, undefined)).toBeNull()
  })
})
