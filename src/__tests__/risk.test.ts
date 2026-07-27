import { describe, it, expect } from 'vitest'
import { computeRiskPlan } from '@/domain/risk'
import { mkPivot, mkScenario } from './helpers'

/** Impulso bajista completado → sesgo compra (largo). */
function bearishImpulseDone() {
  return mkScenario({
    kind: 'impulse',
    pattern: 'impulso',
    direction: 'down',
    invalidation: { price: 90, reason: '' },
    target: { label: 'Zona de corrección', low: 120, high: 140 },
    pivots: [
      mkPivot(0, 200, 'high'),
      mkPivot(10, 160, 'low'),
      mkPivot(20, 180, 'high'),
      mkPivot(30, 130, 'low'),
      mkPivot(40, 150, 'high'),
      mkPivot(50, 90, 'low'),
    ],
  })
}

describe('computeRiskPlan', () => {
  it('largo sobre impulso bajista completado: matemática exacta', () => {
    const plan = computeRiskPlan(bearishImpulseDone(), 100, 1000, 1)
    expect(plan).not.toBeNull()
    expect(plan!.bias).toBe('compra')
    expect(plan!.stop).toBe(90)
    expect(plan!.stopLabel).toBe('invalidación')
    expect(plan!.stopDistPct).toBeCloseTo(0.1)
    expect(plan!.riskAmount).toBe(10) // 1000 × 1%
    expect(plan!.positionNotional).toBeCloseTo(100) // 10 / 0.1
    expect(plan!.positionUnits).toBeCloseTo(1)
    expect(plan!.targetNear).toBe(120) // borde conservador (low en largo)
    expect(plan!.rr).toBeCloseTo(2) // (120−100) / (100−90)
    expect(plan!.leverage).toBeCloseTo(0.1)
  })

  it('corrección ABC bajista: stop = extremo de C, objetivo = origen', () => {
    const abc = mkScenario({
      kind: 'correction',
      pattern: 'zigzag',
      direction: 'down',
      // La invalidación del CONTEO es el origen (arriba): NO debe usarse como stop.
      invalidation: { price: 120, reason: '' },
      pivots: [
        mkPivot(0, 120, 'high'),
        mkPivot(10, 100, 'low'),
        mkPivot(20, 110, 'high'),
        mkPivot(30, 95, 'low'), // extremo de C
      ],
    })
    const plan = computeRiskPlan(abc, 100, 1000, 1)
    expect(plan).not.toBeNull()
    expect(plan!.bias).toBe('compra')
    expect(plan!.stop).toBe(95)
    expect(plan!.stopLabel).toBe('extremo de la corrección')
    expect(plan!.targetNear).toBe(120) // origen de la corrección
    expect(plan!.rr).toBeCloseTo(4) // 20 / 5
  })

  it('stop al lado equivocado de la entrada → null', () => {
    // Largo con el precio YA por debajo del stop.
    const plan = computeRiskPlan(bearishImpulseDone(), 85, 1000, 1)
    expect(plan).toBeNull()
  })

  it('escenario "vigilar" (triángulo) → null', () => {
    const tri = mkScenario({
      kind: 'correction',
      pattern: 'triangulo',
      direction: 'down',
      pivots: [mkPivot(0, 120, 'high'), mkPivot(10, 100, 'low'), mkPivot(20, 112, 'high'), mkPivot(30, 104, 'low'), mkPivot(40, 109, 'high'), mkPivot(50, 106, 'low')],
    })
    expect(computeRiskPlan(tri, 107, 1000, 1)).toBeNull()
  })

  it('stop muy ceñido → aviso de apalancamiento', () => {
    const s = bearishImpulseDone()
    s.invalidation = { price: 99.5, reason: '' } // 0.5% de distancia
    const plan = computeRiskPlan(s, 100, 1000, 1)
    expect(plan).not.toBeNull()
    expect(plan!.leverage).toBeGreaterThan(1)
    expect(plan!.warnings.some((w) => w.includes('apalancamiento'))).toBe(true)
  })

  it('onda 5 en desarrollo (continuación alcista): plan largo con stop en la invalidación', () => {
    const dev = mkScenario({
      kind: 'impulse',
      pattern: 'impulso',
      direction: 'up',
      developing: true,
      invalidation: { price: 90, reason: '' }, // onda 4, por debajo
      target: { label: 'Zona objetivo onda 5', low: 120, high: 140 },
      pivots: [
        mkPivot(0, 80, 'low'),
        mkPivot(10, 110, 'high'),
        mkPivot(20, 95, 'low'),
        mkPivot(30, 150, 'high'),
        mkPivot(40, 90, 'low'),
        mkPivot(50, 105, 'high', false), // onda 5 en curso (sin confirmar)
      ],
    })
    const plan = computeRiskPlan(dev, 100, 1000, 1)
    expect(plan).not.toBeNull()
    expect(plan!.bias).toBe('compra') // continuación al alza
    expect(plan!.stop).toBe(90) // invalidación (onda 4)
    expect(plan!.stopLabel).toContain('onda en curso')
    expect(plan!.targetNear).toBe(120) // borde cercano de la zona de la onda 5
    expect(plan!.rr).toBeCloseTo(2) // (120−100)/(100−90)
  })

  it('entradas inválidas → null', () => {
    expect(computeRiskPlan(bearishImpulseDone(), 0, 1000, 1)).toBeNull()
    expect(computeRiskPlan(bearishImpulseDone(), 100, 0, 1)).toBeNull()
    expect(computeRiskPlan(bearishImpulseDone(), 100, 1000, 0)).toBeNull()
  })

  it('corrección DEVELOPING: la rama "en desarrollo" tiene precedencia sobre la de corrección', () => {
    // Onda C bajista en curso: el stop debe ser la INVALIDACIÓN de la onda en curso
    // (extremo de B, 110), no el extremo de C (95, el último pivote). Si se reordenara
    // el if/else (correction antes que developing), el stop sería 95 → por debajo de la
    // entrada de un corto → el plan saldría null. Este test mata esa mutación.
    const devAbc = mkScenario({
      kind: 'correction',
      pattern: 'zigzag',
      direction: 'down',
      developing: true,
      invalidation: { price: 110, reason: '' },
      target: { label: 'Zona objetivo C', low: 90, high: 96 },
      pivots: [
        mkPivot(0, 120, 'high'),
        mkPivot(10, 100, 'low'),
        mkPivot(20, 110, 'high'),
        mkPivot(30, 95, 'low', false), // onda C en curso
      ],
    })
    const plan = computeRiskPlan(devAbc, 105, 1000, 1)
    expect(plan).not.toBeNull()
    expect(plan!.bias).toBe('venta')
    expect(plan!.stop).toBe(110) // invalidación de la onda en curso, NO el extremo de C (95)
    expect(plan!.stopLabel).toBe('invalidación de la onda en curso')
  })

  it('precio ya más allá de la zona objetivo → sin objetivo, sin R:R, con aviso', () => {
    // Largo con el precio (130) YA dentro de la zona [120, 140]: no hay recorrido.
    const plan = computeRiskPlan(bearishImpulseDone(), 130, 1000, 1)
    expect(plan).not.toBeNull()
    expect(plan!.targetNear).toBeNull()
    expect(plan!.targetFar).toBeNull()
    expect(plan!.rr).toBeNull()
    expect(plan!.warnings.some((w) => w.includes('dentro'))).toBe(true)
  })

  it('objetivo con borde conservador <= 0 (zona degenerada) → sin objetivo y SIN aviso de zona', () => {
    const s = bearishImpulseDone()
    s.target = { label: 'Zona', low: -5, high: 2 } // borde cercano (low, en largo) inválido
    const plan = computeRiskPlan(s, 100, 1000, 1)
    expect(plan!.targetNear).toBeNull()
    expect(plan!.targetFar).toBeNull()
    expect(plan!.rr).toBeNull()
    // El guard de zona degenerada es silencioso: NO empuja el aviso de "ya está dentro".
    expect(plan!.warnings.some((w) => w.includes('dentro'))).toBe(false)
  })

  it('R:R menor que 1 → aviso', () => {
    const s = bearishImpulseDone()
    s.invalidation = { price: 50, reason: '' } // stop lejano (dist 50)
    s.target = { label: 'Zona', low: 105, high: 110 } // objetivo cercano (reward 5)
    const plan = computeRiskPlan(s, 100, 1000, 1)
    expect(plan!.rr).toBeLessThan(1) // 5 / 50 = 0.1
    expect(plan!.warnings.some((w) => w.includes('R:R menor que 1'))).toBe(true)
  })

  it('stop a menos de 0,5% de la entrada → aviso "Stop muy cercano"', () => {
    const s = bearishImpulseDone()
    s.invalidation = { price: 99.6, reason: '' } // 0,4% de 100 (< 0,5%)
    const plan = computeRiskPlan(s, 100, 1000, 1)
    expect(plan!.stopDistPct).toBeLessThan(0.005)
    expect(plan!.warnings.some((w) => w.includes('muy cercano'))).toBe(true)
  })
})

describe('colchón de ATR en el stop', () => {
  it('sin colchón el stop queda pegado al nivel (comportamiento por defecto intacto)', () => {
    const s = bearishImpulseDone() // completado bajista → se opera al alza; stop en 90
    const plan = computeRiskPlan(s, 100, 1000, 1)
    expect(plan!.stop).toBe(90)
    expect(plan!.stopLevel).toBe(90)
    expect(plan!.stopBuffer).toBe(0)
    expect(plan!.stopBufferAtr).toBe(0)
  })

  it('en LARGO aleja el stop hacia ABAJO y conserva el nivel estructural', () => {
    const s = bearishImpulseDone()
    const plan = computeRiskPlan(s, 100, 1000, 1, { atr: 5, bufferAtr: 1 })
    expect(plan!.stopLevel).toBe(90) // el nivel de la tesis no se mueve
    expect(plan!.stop).toBe(85) // 90 − 1×5
    expect(plan!.stopBuffer).toBe(5)
    expect(plan!.stopDistPct).toBeCloseTo(0.15, 5) // 15/100
  })

  it('en CORTO aleja el stop hacia ARRIBA', () => {
    // Impulso ALCISTA completado → giro a la baja (venta); stop = invalidación por encima.
    const s = mkScenario({
      kind: 'impulse',
      pattern: 'impulso',
      direction: 'up',
      invalidation: { price: 110, reason: '' },
      target: { label: 'Zona', low: 80, high: 90 },
      pivots: [
        mkPivot(0, 60, 'low'),
        mkPivot(10, 80, 'high'),
        mkPivot(20, 70, 'low'),
        mkPivot(30, 100, 'high'),
        mkPivot(40, 90, 'low'),
        mkPivot(50, 110, 'high'),
      ],
    })
    const plan = computeRiskPlan(s, 100, 1000, 1, { atr: 4, bufferAtr: 0.5 })
    expect(plan!.bias).toBe('venta')
    expect(plan!.stopLevel).toBe(110)
    expect(plan!.stop).toBe(112) // 110 + 0.5×4
  })

  it('el colchón EMPEORA el R:R y REDUCE el tamaño de la posición (es un tradeoff explícito)', () => {
    const s = bearishImpulseDone()
    const sin = computeRiskPlan(s, 100, 1000, 1)
    const con = computeRiskPlan(s, 100, 1000, 1, { atr: 5, bufferAtr: 1 })
    expect(con!.rr!).toBeLessThan(sin!.rr!)
    expect(con!.positionNotional).toBeLessThan(sin!.positionNotional)
    // El riesgo máximo en USDC NO cambia: es lo que el colchón preserva.
    expect(con!.riskAmount).toBeCloseTo(sin!.riskAmount, 10)
  })

  it('ignora el colchón si no hay ATR utilizable (degrada al comportamiento sin colchón)', () => {
    const s = bearishImpulseDone()
    for (const atr of [null, undefined, 0, NaN]) {
      const plan = computeRiskPlan(s, 100, 1000, 1, { atr, bufferAtr: 1 })
      expect(plan!.stop).toBe(90)
      expect(plan!.stopBuffer).toBe(0)
    }
  })
})
