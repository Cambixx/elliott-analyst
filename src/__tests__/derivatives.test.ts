import { describe, it, expect } from 'vitest'
import {
  classifyFunding,
  annualizedFunding,
  oiTrend,
  derivativesRead,
} from '@/domain/derivatives'
import { resolvePerp, type OiPoint } from '@/api/binance-futures'

describe('resolvePerp', () => {
  const perps = new Set(['BTCUSDT', 'ETHUSDT', '1000PEPEUSDT', '1000000MOGUSDT'])

  it('resuelve el perpetuo directo', () => {
    expect(resolvePerp('BTC', perps)).toBe('BTCUSDT')
  })

  it('resuelve la familia escalada (PEPE → 1000PEPEUSDT)', () => {
    expect(resolvePerp('PEPE', perps)).toBe('1000PEPEUSDT')
    expect(resolvePerp('MOG', perps)).toBe('1000000MOGUSDT')
  })

  it('devuelve null si no hay perpetuo', () => {
    expect(resolvePerp('XYZ', perps)).toBeNull()
  })
})

describe('classifyFunding', () => {
  it('clasifica por nivel con signo', () => {
    expect(classifyFunding(0.0006)).toBe('muy-positivo')
    expect(classifyFunding(0.0002)).toBe('positivo')
    expect(classifyFunding(0)).toBe('neutral')
    expect(classifyFunding(0.00005)).toBe('neutral')
    expect(classifyFunding(-0.0002)).toBe('negativo')
    expect(classifyFunding(-0.0006)).toBe('muy-negativo')
  })

  it('anualiza el funding (×3×365)', () => {
    expect(annualizedFunding(0.0001)).toBeCloseTo(0.1095)
  })
})

describe('oiTrend', () => {
  const series = (vals: number[]): OiPoint[] => vals.map((v, i) => ({ value: v, timestamp: i }))

  it('detecta subida (>+3% vs ~24h antes = 6 velas)', () => {
    // 7 puntos: ref = índice (len-7) = primero; last sube >3%.
    const r = oiTrend(series([100, 100, 100, 100, 100, 100, 110]))
    expect(r.trend).toBe('subiendo')
    expect(r.changePct).toBeCloseTo(0.1)
  })

  it('detecta bajada', () => {
    expect(oiTrend(series([100, 100, 100, 100, 100, 100, 90])).trend).toBe('bajando')
  })

  it('estable dentro de ±3%', () => {
    expect(oiTrend(series([100, 100, 100, 100, 100, 100, 101])).trend).toBe('estable')
  })

  it('series demasiado cortas → estable, sin romper', () => {
    expect(oiTrend(series([100, 105])).trend).toBe('estable')
  })
})

describe('derivativesRead (lectura en clave Elliott)', () => {
  it('venta + funding muy positivo → refuerza la caída esperada (texto direccional, no asume techo)', () => {
    const r = derivativesRead('muy-positivo', 'subiendo', 'venta')
    expect(r.alignment).toBe('refuerza')
    expect(r.text.toLowerCase()).toContain('caída esperada')
    // No debe asumir reversión/techo (sirve también para continuación bajista).
    expect(r.text.toLowerCase()).not.toContain('techo')
  })

  it('venta + funding muy negativo → cautela (posible short squeeze)', () => {
    const r = derivativesRead('muy-negativo', 'estable', 'venta')
    expect(r.alignment).toBe('cautela')
    expect(r.text.toLowerCase()).toContain('squeeze')
  })

  it('compra + funding muy negativo → refuerza el rebote', () => {
    const r = derivativesRead('muy-negativo', 'bajando', 'compra')
    expect(r.alignment).toBe('refuerza')
  })

  it('compra + funding muy positivo → cautela (largos masificados)', () => {
    expect(derivativesRead('muy-positivo', 'subiendo', 'compra').alignment).toBe('cautela')
  })

  it('funding no extremo → neutral', () => {
    expect(derivativesRead('positivo', 'estable', 'venta').alignment).toBe('neutral')
    expect(derivativesRead('neutral', 'estable', 'compra').alignment).toBe('neutral')
  })

  it('sesgo vigilar → siempre neutral', () => {
    expect(derivativesRead('muy-positivo', 'subiendo', 'vigilar').alignment).toBe('neutral')
  })
})
