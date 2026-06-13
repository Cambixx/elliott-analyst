import { describe, it, expect } from 'vitest'
import { formatPrice } from '@/lib/format'

describe('formatPrice', () => {
  it('precios altos con 2 decimales', () => {
    expect(formatPrice(61281.113)).toBe('61.281,11')
  })

  it('monedas baratas NO se muestran como "0"', () => {
    expect(formatPrice(0.0000234)).not.toBe('0')
    expect(formatPrice(0.0000234)).toContain('0,0000234')
  })

  it('valores inválidos → guion', () => {
    expect(formatPrice(null)).toBe('—')
    expect(formatPrice(undefined)).toBe('—')
    expect(formatPrice(NaN)).toBe('—')
  })

  it('cero exacto → "0"', () => {
    expect(formatPrice(0)).toBe('0')
  })
})
