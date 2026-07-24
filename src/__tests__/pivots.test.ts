import { describe, it, expect } from 'vitest'
import {
  fractalPivots,
  pivotLevels,
  trendConsistentPivots,
  PIVOT_STRENGTH,
  MAX_PIVOT_LEVELS,
} from '@/domain/indicators/pivots'
import type { Candle } from '@/types/market'

/** Pivote de prueba. */
const pv = (index: number, price: number, type: 'high' | 'low') => ({
  index,
  timestamp: index * 60_000,
  price,
  type,
})

/** Construye velas a partir de arrays de high/low (open=close=punto medio). */
function mkCandles(highs: number[], lows: number[], closed = true): Candle[] {
  return highs.map((h, i) => {
    const l = lows[i]
    const mid = (h + l) / 2
    return { timestamp: i * 60_000, open: mid, high: h, low: l, close: mid, volume: 100, closed }
  })
}

describe('fractalPivots', () => {
  it('detecta un máximo local claro con fuerza simétrica', () => {
    // Pico único en el índice 3 (high 15), rodeado de highs menores a cada lado.
    const highs = [10, 11, 12, 15, 12, 11, 10]
    const lows = highs.map((h) => h - 1)
    const pivots = fractalPivots(mkCandles(highs, lows), { left: 3, right: 3 })
    const highPivots = pivots.filter((p) => p.type === 'high')
    expect(highPivots).toHaveLength(1)
    expect(highPivots[0]).toMatchObject({ index: 3, price: 15, type: 'high' })
  })

  it('detecta un mínimo local claro', () => {
    const lows = [20, 19, 18, 15, 18, 19, 20]
    const highs = lows.map((l) => l + 1)
    const pivots = fractalPivots(mkCandles(highs, lows), { left: 3, right: 3 })
    const lowPivots = pivots.filter((p) => p.type === 'low')
    expect(lowPivots).toHaveLength(1)
    expect(lowPivots[0]).toMatchObject({ index: 3, price: 15, type: 'low' })
  })

  it('NO emite pivotes en las últimas `right` velas (anti-repaint)', () => {
    // Serie con picos REALES en 2 y 6; el 6 es el más nuevo confirmable (n-1-right).
    const highs = [10, 10, 18, 10, 10, 10, 20, 10, 10]
    const lows = highs.map((h) => h - 1)
    const right = 2
    const pivots = fractalPivots(mkCandles(highs, lows), { left: 2, right })
    const n = highs.length
    expect(pivots.length).toBeGreaterThan(0) // no vacuo: hay pivotes reales
    expect(pivots.every((p) => p.index <= n - 1 - right)).toBe(true)
  })

  it('ANTI-REPAINT: extender la serie nunca reescribe ni borra un pivote previo (prefijo estable)', () => {
    // Zigzag con extremos de una sola vela; pivotes esperados en index 2/5/7/10/12.
    const highs = [10, 12, 16, 12, 10, 9, 11, 17, 11, 9, 8, 10, 14, 10, 8]
    const lows = highs.map((h) => h - 5)
    const full = mkCandles(highs, lows)
    const key = (p: { index: number; price: number; type: string }) => `${p.index}:${p.price}:${p.type}`
    let prev: string[] = []
    for (const k of [8, 10, 13, 15]) {
      const cur = fractalPivots(full.slice(0, k), { left: 2, right: 2 }).map(key)
      // cada resultado debe empezar EXACTAMENTE por el anterior (solo puede AÑADIR al final).
      expect(cur.slice(0, prev.length)).toEqual(prev)
      prev = cur
    }
    expect(prev.length).toBeGreaterThan(2) // el prefijo creció con pivotes reales
  })

  it('una vela en formación al final (closed=false) no produce ni confirma pivotes', () => {
    const highs = [10, 11, 15, 11, 10]
    const lows = highs.map((h) => h - 1)
    // Con todo cerrado hay un pivote alto en index 2 (usa index 4 como vecino derecho).
    expect(fractalPivots(mkCandles(highs, lows), { left: 2, right: 2 })).toHaveLength(1)
    // Si la última vela está en formación, se excluye → index 2 pierde su vecino derecho.
    const withLive = mkCandles(highs, lows)
    withLive[withLive.length - 1] = { ...withLive[withLive.length - 1], closed: false }
    expect(fractalPivots(withLive, { left: 2, right: 2 })).toHaveLength(0)
  })

  it('una barra envolvente puede ser máximo Y mínimo (dos triángulos en la misma vela)', () => {
    const highs = [10, 10, 20, 10, 10]
    const lows = [5, 5, 1, 5, 5]
    const pivots = fractalPivots(mkCandles(highs, lows), { left: 2, right: 2 })
    expect(pivots.filter((p) => p.index === 2 && p.type === 'high')).toHaveLength(1)
    expect(pivots.filter((p) => p.index === 2 && p.type === 'low')).toHaveLength(1)
  })

  it('serie vacía o demasiado corta devuelve [] sin excepciones', () => {
    expect(fractalPivots([], { left: 2, right: 2 })).toEqual([])
    // n = left+right → no hay índice con vecinos suficientes a ambos lados.
    expect(fractalPivots(mkCandles([1, 2, 3, 4], [0, 1, 2, 3]), { left: 2, right: 2 })).toEqual([])
  })

  it('exige superioridad a AMBOS lados (no solo a la izquierda)', () => {
    // El índice 3 supera a la izquierda pero NO a la derecha (sigue subiendo) → no es pivote.
    const highs = [10, 11, 12, 13, 20, 12, 11]
    const lows = highs.map((h) => h - 1)
    const pivots = fractalPivots(mkCandles(highs, lows), { left: 2, right: 2 })
    const at3 = pivots.find((p) => p.index === 3 && p.type === 'high')
    expect(at3).toBeUndefined()
    // El verdadero pivote es el índice 4 (20).
    expect(pivots.find((p) => p.index === 4 && p.type === 'high')).toBeDefined()
  })

  it('una meseta de dos máximos idénticos no genera pivotes espurios', () => {
    const highs = [10, 11, 15, 15, 11, 10]
    const lows = highs.map((h) => h - 1)
    const pivots = fractalPivots(mkCandles(highs, lows), { left: 2, right: 2 })
    // Ninguno de los dos 15 gana al empatar con el otro → sin pivote alto.
    expect(pivots.filter((p) => p.type === 'high')).toHaveLength(0)
  })

  it('usa PIVOT_STRENGTH por defecto a ambos lados', () => {
    const n = 3 * PIVOT_STRENGTH + 1
    const highs = Array.from({ length: n }, (_, i) => (i === PIVOT_STRENGTH ? 100 : 10 + i))
    const lows = highs.map((h) => h - 1)
    const pivots = fractalPivots(mkCandles(highs, lows))
    // El pico artificial en index=PIVOT_STRENGTH tiene fuerza suficiente a ambos lados.
    expect(pivots.some((p) => p.index === PIVOT_STRENGTH && p.type === 'high')).toBe(true)
  })
})

describe('trendConsistentPivots (estructura de mercado)', () => {
  it('en tendencia alcista conserva máximos y mínimos crecientes, descarta el contra-tendencia', () => {
    const pivots = [pv(0, 100, 'low'), pv(1, 110, 'high'), pv(2, 105, 'low'), pv(3, 120, 'high'), pv(4, 115, 'high')]
    const up = pivots.map(() => true)
    const kept = trendConsistentPivots(pivots, up)
    // 115 en index 4 es un máximo MÁS BAJO que 120 → se descarta en tendencia alcista.
    expect(kept.map((p) => p.price)).toEqual([100, 110, 105, 120])
  })

  it('en tendencia bajista conserva máximos y mínimos decrecientes', () => {
    const pivots = [pv(0, 120, 'high'), pv(1, 110, 'low'), pv(2, 115, 'high'), pv(3, 105, 'low'), pv(4, 108, 'low')]
    const down = pivots.map(() => false)
    const kept = trendConsistentPivots(pivots, down)
    // 108 en index 4 es un mínimo MÁS ALTO que 105 → se descarta en tendencia bajista.
    expect(kept.map((p) => p.price)).toEqual([120, 110, 115, 105])
  })

  it('al cambiar el sentido de la tendencia marca el giro (reinicia referencias)', () => {
    const pivots = [pv(1, 120, 'high'), pv(2, 118, 'high'), pv(4, 119, 'high')]
    const trendUp = [true, true, true, true, false] // el pivote de index 4 cae en tendencia bajista
    const kept = trendConsistentPivots(pivots, trendUp)
    // index 2 (118<120) se descarta en alcista; index 4 (119<120) SÍ se marca: es el primer
    // máximo tras el giro a bajista, con las referencias reiniciadas.
    expect(kept.map((p) => p.index)).toEqual([1, 4])
  })

  it('sin datos de tendencia (array corto) trata como alcista por defecto', () => {
    const pivots = [pv(0, 100, 'low'), pv(1, 110, 'high'), pv(2, 90, 'low')]
    const kept = trendConsistentPivots(pivots, [])
    // Por defecto alcista → el mínimo decreciente (90<100) se descarta.
    expect(kept.map((p) => p.price)).toEqual([100, 110])
  })
})

describe('pivotLevels', () => {
  const mk = (index: number, price: number, type: 'high' | 'low') => ({
    index,
    timestamp: index * 60_000,
    price,
    type,
  })

  it('devuelve los más recientes primero, hasta `count`', () => {
    const pivots = [mk(0, 100, 'low'), mk(1, 110, 'high'), mk(2, 105, 'low'), mk(3, 120, 'high')]
    const levels = pivotLevels(pivots, { count: 2 })
    expect(levels).toHaveLength(2)
    expect(levels[0].price).toBe(120) // el más reciente
    expect(levels[1].price).toBe(105)
  })

  it('deduplica niveles casi iguales (dentro de tolPct)', () => {
    const pivots = [mk(0, 100, 'low'), mk(1, 100.1, 'high'), mk(2, 130, 'high')]
    const levels = pivotLevels(pivots, { count: 5, tolPct: 0.01 })
    // 130 y 100.1 se conservan; el 100 (a <1% de 100.1) se descarta como duplicado.
    expect(levels.map((l) => l.price)).toEqual([130, 100.1])
  })

  it('ignora precios no positivos', () => {
    const pivots = [mk(0, 0, 'low'), mk(1, -5, 'low'), mk(2, 50, 'high')]
    const levels = pivotLevels(pivots, { count: 5 })
    expect(levels.map((l) => l.price)).toEqual([50])
  })

  it('con `price` encuadra: los más cercanos por encima y por debajo', () => {
    // Niveles 90,95,105,110 alrededor de un precio 100. Con count 2 (1 arriba, 1 abajo)
    // deben salir los más cercanos: 105 (arriba) y 95 (abajo).
    const pivots = [mk(0, 90, 'low'), mk(1, 95, 'low'), mk(2, 105, 'high'), mk(3, 110, 'high')]
    const levels = pivotLevels(pivots, { price: 100, count: 2 })
    expect(new Set(levels.map((l) => l.price))).toEqual(new Set([105, 95]))
  })

  it('con `price`, si un lado va corto rellena desde el otro', () => {
    // Precio 100 pero SOLO hay niveles por debajo → los 3 se devuelven igualmente.
    const pivots = [mk(0, 80, 'low'), mk(1, 90, 'low'), mk(2, 95, 'low')]
    const levels = pivotLevels(pivots, { price: 100, count: 3 })
    expect(levels).toHaveLength(3)
    expect(levels.every((l) => l.price < 100)).toBe(true)
  })

  it('rellena HACIA ARRIBA cuando abajo va corto (espejo del caso anterior)', () => {
    // Precio 100, 4 niveles arriba y 1 abajo, count 4 → 3 arriba + 1 abajo = 4 (no se queda corto).
    const pivots = [mk(0, 95, 'low'), mk(1, 105, 'high'), mk(2, 110, 'high'), mk(3, 115, 'high'), mk(4, 120, 'high')]
    const levels = pivotLevels(pivots, { price: 100, count: 4 })
    expect(levels).toHaveLength(4)
    expect(levels.filter((l) => l.price > 100)).toHaveLength(3) // relleno por arriba
    expect(levels.filter((l) => l.price < 100)).toHaveLength(1)
  })

  it('descarta niveles con precio no finito (NaN) en ambas ramas', () => {
    const pivots = [mk(0, NaN, 'high'), mk(1, 50, 'low'), mk(2, 150, 'high')]
    expect(pivotLevels(pivots, { count: 5 }).every((l) => Number.isFinite(l.price))).toBe(true)
    expect(pivotLevels(pivots, { price: 100 }).every((l) => Number.isFinite(l.price))).toBe(true)
  })

  it('con los parámetros por defecto (producción) nunca excede MAX_PIVOT_LEVELS', () => {
    // 20 pivotes bien separados alrededor del precio; la llamada real de App no pasa count.
    const pivots = Array.from({ length: 20 }, (_, i) => mk(i, 100 + (i - 10) * 3, i % 2 ? 'high' : 'low'))
    const levels = pivotLevels(pivots, { price: 100 })
    expect(levels.length).toBeLessThanOrEqual(MAX_PIVOT_LEVELS)
    expect(levels.length).toBeGreaterThan(0)
  })
})
