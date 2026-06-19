import { describe, it, expect } from 'vitest'
import { computeRealizedR, journalStats, type JournalEntry } from '@/domain/journal'

describe('computeRealizedR', () => {
  it('largo ganador: R positivo en múltiplos del riesgo', () => {
    // entry 100, stop 90 (riesgo 10), salida 130 → +30/10 = 3R.
    expect(computeRealizedR(100, 90, 130, 'compra')).toBeCloseTo(3)
  })

  it('largo perdedor: salir en el stop = -1R', () => {
    expect(computeRealizedR(100, 90, 90, 'compra')).toBeCloseTo(-1)
  })

  it('corto ganador', () => {
    // entry 100, stop 110 (riesgo 10), salida 80 → +20/10 = 2R.
    expect(computeRealizedR(100, 110, 80, 'venta')).toBeCloseTo(2)
  })

  it('riesgo nulo o datos inválidos → null', () => {
    expect(computeRealizedR(100, 100, 120, 'compra')).toBeNull()
    expect(computeRealizedR(100, 90, NaN, 'compra')).toBeNull()
  })
})

function mk(over: Partial<JournalEntry>): JournalEntry {
  return {
    id: 'x',
    createdAt: 0,
    symbol: 'BTCUSDC',
    base: 'BTC',
    timeframe: '4h',
    pattern: 'impulso',
    bias: 'compra',
    developing: false,
    entry: 100,
    stop: 90,
    target: 130,
    plannedRr: 3,
    confidence: 'alta',
    note: '',
    status: 'abierta',
    realizedR: null,
    ...over,
  }
}

describe('journalStats', () => {
  it('calcula win rate sobre las decididas (ignora abiertas/breakeven/canceladas)', () => {
    const entries = [
      mk({ status: 'ganada', realizedR: 3 }),
      mk({ status: 'ganada', realizedR: 1 }),
      mk({ status: 'perdida', realizedR: -1 }),
      mk({ status: 'abierta' }),
      mk({ status: 'cancelada' }),
    ]
    const s = journalStats(entries)
    expect(s.total).toBe(5)
    expect(s.open).toBe(1)
    expect(s.decided).toBe(3)
    expect(s.wins).toBe(2)
    expect(s.losses).toBe(1)
    expect(s.winRate).toBeCloseTo(2 / 3)
    expect(s.realizedRSum).toBeCloseTo(3) // 3 + 1 - 1
  })

  it('R:R planificado medio', () => {
    const s = journalStats([mk({ plannedRr: 2 }), mk({ plannedRr: 4 }), mk({ plannedRr: null })])
    expect(s.avgPlannedRr).toBeCloseTo(3)
  })

  it('desglose por patrón con su win rate', () => {
    const entries = [
      mk({ pattern: 'impulso', status: 'ganada' }),
      mk({ pattern: 'impulso', status: 'perdida' }),
      mk({ pattern: 'zigzag', status: 'ganada' }),
    ]
    const s = journalStats(entries)
    const imp = s.byPattern.find((p) => p.pattern === 'impulso')!
    const zz = s.byPattern.find((p) => p.pattern === 'zigzag')!
    expect(imp.n).toBe(2)
    expect(imp.winRate).toBeCloseTo(0.5)
    expect(zz.winRate).toBe(1)
  })

  it('diario vacío → métricas nulas sin romper', () => {
    const s = journalStats([])
    expect(s.total).toBe(0)
    expect(s.winRate).toBeNull()
    expect(s.avgPlannedRr).toBeNull()
    expect(s.realizedRSum).toBeNull()
  })
})
