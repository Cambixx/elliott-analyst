import { describe, it, expect } from 'vitest'
import { rsi } from '@/domain/indicators/rsi'
import { ema } from '@/domain/indicators/ema'

describe('rsi', () => {
  it('precio totalmente plano → RSI neutro 50 (no 100)', () => {
    const flat = Array(40).fill(100)
    const out = rsi(flat, 14)
    for (let i = 14; i < out.length; i++) expect(out[i]).toBe(50)
  })

  it('subida sin retrocesos → RSI 100', () => {
    const rising = Array.from({ length: 40 }, (_, i) => 100 + i)
    const out = rsi(rising, 14)
    expect(out[out.length - 1]).toBe(100)
  })

  it('warmup en NaN y valores siempre en [0, 100]', () => {
    const mixed = Array.from({ length: 60 }, (_, i) => 100 + Math.sin(i / 3) * 10)
    const out = rsi(mixed, 14)
    for (let i = 0; i < 14; i++) expect(Number.isNaN(out[i])).toBe(true)
    for (let i = 14; i < out.length; i++) {
      expect(out[i]).toBeGreaterThanOrEqual(0)
      expect(out[i]).toBeLessThanOrEqual(100)
    }
  })
})

describe('ema', () => {
  it('serie constante → EMA igual a la constante tras el warmup', () => {
    const flat = Array(30).fill(50)
    const out = ema(flat, 10)
    expect(out[29]).toBeCloseTo(50, 10)
  })

  it('serie más corta que el periodo → todo NaN', () => {
    const out = ema([1, 2, 3], 10)
    expect(out.every((v) => Number.isNaN(v))).toBe(true)
  })
})
