import { describe, it, expect } from 'vitest'
import { classifyFreshness } from '@/domain/data/freshness'

const H = 3_600_000 // 1h

describe('classifyFreshness', () => {
  it('vela recién cerrada / dentro del intervalo → fresh', () => {
    expect(classifyFreshness(0, H)).toBe('fresh')
    expect(classifyFreshness(H * 0.9, H)).toBe('fresh')
    expect(classifyFreshness(H, H)).toBe('fresh')
  })

  it('entre 1 y 2 intervalos → lagging', () => {
    expect(classifyFreshness(H * 1.5, H)).toBe('lagging')
    expect(classifyFreshness(H * 2, H)).toBe('lagging')
  })

  it('más de 2 intervalos → stale', () => {
    expect(classifyFreshness(H * 2.1, H)).toBe('stale')
    expect(classifyFreshness(H * 10, H)).toBe('stale')
  })

  it('sin edad o sin paso → unknown', () => {
    expect(classifyFreshness(null, H)).toBe('unknown')
    expect(classifyFreshness(H, 0)).toBe('unknown')
  })
})
