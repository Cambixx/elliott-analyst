import { describe, it, expect } from 'vitest'
import { detectScenarios } from '@/domain/elliott/detector'
import { deriveOpportunity, scenarioBias } from '@/domain/elliott/opportunity'
import { candlesFromPath, mkPivot, mkScenario } from './helpers'

/**
 * Regresión (hallazgo de auditoría): el objetivo del triángulo (±amplitud)
 * contiene la propia estructura, así que "precio en zona objetivo" se cumplía
 * SIEMPRE, incluso sin ruptura → alertas espurias con razón engañosa.
 * Tras el fix, la zona de decisión del triángulo es la RUPTURA.
 */
describe('deriveOpportunity con triángulos', () => {
  // Triángulo contractivo 100→120→104→116→106→114, precio final ~112 (dentro).
  const candles = candlesFromPath([100, 120, 104, 116, 106, 114, 112], 6)
  const { scenarios } = detectScenarios(candles, 3)
  const tri = scenarios.find((s) => s.pattern === 'triangulo')

  it('el detector encuentra el triángulo de referencia', () => {
    expect(tri).toBeDefined()
  })

  it('precio DENTRO del triángulo: la razón nunca menciona la ruptura', () => {
    if (!tri) return
    const inside = 112
    for (const level of ['estricto', 'equilibrado', 'amplio'] as const) {
      const opp = deriveOpportunity(tri, inside, level)
      if (opp) {
        expect(opp.reason).not.toContain('ruptura')
        expect(opp.reason).not.toContain('objetivo tras ruptura')
      }
    }
  })

  it('precio FUERA del rango del triángulo (ruptura): sí cuenta como zona de decisión', () => {
    if (!tri) return
    const breakout = Math.max(...tri.pivots.map((p) => p.price)) * 1.03
    const opp = deriveOpportunity(tri, breakout, 'amplio')
    expect(opp).not.toBeNull()
    expect(opp!.reason).toContain('ruptura del triángulo')
  })
})

/**
 * Sesgo según fase: en DESARROLLO se opera la CONTINUACIÓN hacia el objetivo (en el
 * sentido de la onda); COMPLETADO se opera el giro/reanudación (sentido contrario).
 */
describe('scenarioBias por fase (desarrollo vs completado)', () => {
  const base = {
    kind: 'impulse' as const,
    pattern: 'diagonal' as const,
    direction: 'up' as const,
    pivots: [mkPivot(0, 100, 'low'), mkPivot(10, 120, 'high')],
  }

  it('en desarrollo (alcista) → compra (continuación hacia el objetivo)', () => {
    expect(scenarioBias(mkScenario({ ...base, developing: true }))).toBe('compra')
  })

  it('completada (alcista) → venta (reversión tras completarse)', () => {
    expect(scenarioBias(mkScenario({ ...base, developing: false }))).toBe('venta')
  })

  it('impulso en desarrollo bajista → venta (continuación a la baja)', () => {
    const imp = {
      kind: 'impulse' as const,
      pattern: 'impulso' as const,
      direction: 'down' as const,
      developing: true,
      pivots: [mkPivot(0, 120, 'high'), mkPivot(10, 100, 'low')],
    }
    expect(scenarioBias(mkScenario(imp))).toBe('venta')
  })

  it('corrección ABC en desarrollo bajista → venta (continuación de la corrección)', () => {
    const abc = {
      kind: 'correction' as const,
      pattern: 'zigzag' as const,
      direction: 'down' as const,
      developing: true,
      pivots: [mkPivot(0, 120, 'high'), mkPivot(10, 100, 'low'), mkPivot(20, 110, 'high'), mkPivot(30, 95, 'low', false)],
    }
    expect(scenarioBias(mkScenario(abc))).toBe('venta')
  })

  it('triángulo siempre → vigilar (en desarrollo o no)', () => {
    const tri = {
      kind: 'correction' as const,
      pattern: 'triangulo' as const,
      direction: 'up' as const,
      pivots: [mkPivot(0, 100, 'low'), mkPivot(10, 120, 'high')],
    }
    expect(scenarioBias(mkScenario({ ...tri, developing: true }))).toBe('vigilar')
    expect(scenarioBias(mkScenario({ ...tri, developing: false }))).toBe('vigilar')
  })
})

/**
 * Tabla de verdad nivel×confianza×zona de deriveOpportunity (regresión de auditoría:
 * la matriz no tenía NINGUNA aserción y tres mutaciones de un token sobrevivían con
 * la suite en verde). Escenario base no-triángulo: impulso alcista COMPLETADO con
 * invalidación 100 y zona objetivo [110, 115].
 *  - Precios de prueba: 112 (en zona objetivo), 100.6 (a ~0,596% de la invalidación:
 *    dispara equilibrado 0,7% y amplio 1%, NO estricto 0,5%), 100.8 (~0,794%: solo
 *    amplio), 105 (lejos de ambos).
 */
describe('deriveOpportunity — matriz nivel × confianza × zona', () => {
  const base = {
    kind: 'impulse' as const,
    pattern: 'impulso' as const,
    direction: 'up' as const,
    developing: false,
    pivots: [],
    invalidation: { price: 100, reason: '' },
    target: { label: 'Zona objetivo', low: 110, high: 115 },
  }
  const sc = (confidence: 'baja' | 'media' | 'alta') => mkScenario({ ...base, confidence })

  const CASES: Array<{
    level: 'estricto' | 'equilibrado' | 'amplio'
    conf: 'baja' | 'media' | 'alta'
    price: number
    fires: boolean
  }> = [
    // estricto: SOLO alta + en zona de decisión.
    { level: 'estricto', conf: 'alta', price: 112, fires: true },
    { level: 'estricto', conf: 'alta', price: 105, fires: false },
    { level: 'estricto', conf: 'alta', price: 100.6, fires: false }, // 0,596% > 0,5%
    { level: 'estricto', conf: 'media', price: 112, fires: false },
    { level: 'estricto', conf: 'baja', price: 112, fires: false },
    // equilibrado: alta siempre; media solo en zona; baja nunca.
    { level: 'equilibrado', conf: 'alta', price: 105, fires: true },
    { level: 'equilibrado', conf: 'media', price: 112, fires: true },
    { level: 'equilibrado', conf: 'media', price: 100.6, fires: true }, // 0,596% < 0,7%
    { level: 'equilibrado', conf: 'media', price: 100.8, fires: false }, // 0,794% > 0,7%
    { level: 'equilibrado', conf: 'media', price: 105, fires: false },
    { level: 'equilibrado', conf: 'baja', price: 112, fires: false },
    // amplio: media/alta siempre; baja solo en zona (objetivo o junto a invalidación 1%).
    { level: 'amplio', conf: 'media', price: 105, fires: true },
    { level: 'amplio', conf: 'baja', price: 105, fires: false },
    { level: 'amplio', conf: 'baja', price: 112, fires: true },
    { level: 'amplio', conf: 'baja', price: 100.6, fires: true }, // 0,596% < 1%
    { level: 'amplio', conf: 'baja', price: 100.8, fires: true }, // 0,794% < 1%
  ]

  for (const c of CASES) {
    it(`${c.level} · ${c.conf} · precio ${c.price} → ${c.fires ? 'avisa' : 'null'}`, () => {
      const opp = deriveOpportunity(sc(c.conf), c.price, c.level)
      if (c.fires) expect(opp).not.toBeNull()
      else expect(opp).toBeNull()
    })
  }

  it('compone la razón: confianza + zona objetivo', () => {
    const opp = deriveOpportunity(sc('media'), 112, 'equilibrado')
    expect(opp!.reason).toBe('conteo de confluencia media · precio en zona objetivo')
  })

  it('compone la razón: confianza + junto a la invalidación', () => {
    const opp = deriveOpportunity(sc('media'), 100.6, 'equilibrado')
    expect(opp!.reason).toBe('conteo de confluencia media · precio junto al nivel de invalidación')
  })

  it('baja en zona (amplio): la razón solo lleva la zona, sin confianza', () => {
    const opp = deriveOpportunity(sc('baja'), 112, 'amplio')
    expect(opp!.reason).toBe('precio en zona objetivo')
  })

  it('impulso alcista completado → sesgo venta (giro), no compra', () => {
    const opp = deriveOpportunity(sc('alta'), 112, 'equilibrado')
    expect(opp!.bias).toBe('venta')
  })
})
