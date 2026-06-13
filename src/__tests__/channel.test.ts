import { describe, it, expect } from 'vitest'
import {
  wave5ChannelTarget,
  impulseChannelContainment,
  impulseChannelLines,
} from '@/domain/elliott/channel'
import type { Candle } from '@/types/market'
import { mkPivot } from './helpers'

/** Impulso alcista regular con índices equiespaciados. */
function impulsePivots() {
  return [
    mkPivot(0, 100, 'low'),
    mkPivot(10, 120, 'high'),
    mkPivot(20, 112, 'low'),
    mkPivot(30, 150, 'high'),
    mkPivot(40, 140, 'low'),
    mkPivot(50, 165, 'high'),
  ]
}

function flatCandles(n: number, price: number): Candle[] {
  return Array.from({ length: n }, (_, i) => ({
    timestamp: i * 60_000,
    open: price,
    high: price,
    low: price,
    close: price,
    volume: 1,
    closed: true,
  }))
}

describe('wave5ChannelTarget', () => {
  it('proyecta la paralela del canal a un precio positivo y finito (alcista)', () => {
    const t = wave5ChannelTarget(impulsePivots(), 'up')
    expect(t).not.toBeNull()
    expect(t!).toBeGreaterThan(0)
    // La base 2-4 sube de 112→140 en 20 barras (m=1.4/barra); anclada en p3=150@30,
    // proyecta a idx5=50 → 150 + 1.4*20 = 178.
    expect(t!).toBeCloseTo(178, 0)
  })

  it('caso onda 3 casi vertical (ext>2×w1): ancla en onda 1, no en onda 3', () => {
    const p = [
      mkPivot(0, 100, 'low'),
      mkPivot(10, 110, 'high'), // w1 = 10
      mkPivot(20, 105, 'low'),
      mkPivot(30, 140, 'high'), // w3 = 35 > 2×10
      mkPivot(40, 130, 'low'),
      mkPivot(50, 150, 'high'),
    ]
    const t = wave5ChannelTarget(p, 'up')
    expect(t).not.toBeNull()
    // base 2-4: (130-105)/20 = 1.25/barra; anclada en p1=110@10 → 110 + 1.25*40 = 160.
    expect(t!).toBeCloseTo(160, 0)
  })

  it('datos insuficientes → null', () => {
    expect(wave5ChannelTarget([mkPivot(0, 100, 'low')], 'up')).toBeNull()
  })
})

describe('impulseChannelContainment', () => {
  it('precio siguiendo la línea media del canal → contenido', () => {
    // upper: 120+1.5(i-10) ; lower: 100+0.6i ; close = media de ambas.
    const c: Candle[] = Array.from({ length: 60 }, (_, i) => {
      const upper = 120 + 1.5 * (i - 10)
      const lower = 100 + 0.6 * i
      const mid = (upper + lower) / 2
      return { timestamp: i * 60_000, open: mid, high: mid, low: mid, close: mid, volume: 1, closed: true }
    })
    const r = impulseChannelContainment(c, impulsePivots(), 'up')
    expect(r.bars).toBeGreaterThan(0)
    expect(r.contained).toBe(true)
  })

  it('precio que se dispara fuera del canal → no contenido', () => {
    const c = flatCandles(60, 130) // plano: rompe el canal inclinado en los extremos
    const r = impulseChannelContainment(c, impulsePivots(), 'up')
    expect(r.breaches).toBeGreaterThan(0)
  })

  it('líneas del canal expuestas para dibujar', () => {
    const lines = impulseChannelLines(impulsePivots())
    expect(lines).not.toBeNull()
    expect(lines!.lower.p0).toBe(100) // p0
    expect(lines!.upper.p0).toBe(120) // p1
  })
})
