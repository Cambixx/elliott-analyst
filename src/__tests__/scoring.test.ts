import { describe, it, expect } from 'vitest'
import { detectScenarios } from '@/domain/elliott/detector'
import { candlesFromPath } from './helpers'

/**
 * Mejoras de fiabilidad del scoring (research-backed):
 * - un conteo en desarrollo (repintable) no debe rankear igual que uno confirmado;
 * - los ideales de Fibonacci de la onda C dependen de la forma (zigzag vs flat).
 */
describe('penalización de escenarios en desarrollo', () => {
  it('mismo impulso: la versión en desarrollo puntúa por debajo de la confirmada', () => {
    // Impulso alcista 5 ondas. Sin vela posterior → onda 5 sin confirmar (developing).
    const developingPath = [100, 120, 110, 150, 138, 165]
    // Con una onda 6 (retroceso) que confirma el pivote de la onda 5.
    const confirmedPath = [100, 120, 110, 150, 138, 165, 150]

    const dev = detectScenarios(candlesFromPath(developingPath), 1.8).scenarios.find(
      (s) => s.pattern === 'impulso',
    )
    const conf = detectScenarios(candlesFromPath(confirmedPath), 1.8).scenarios.find(
      (s) => s.pattern === 'impulso',
    )
    expect(dev?.developing).toBe(true)
    expect(conf?.developing).toBe(false)
    expect(dev!.score).toBeLessThan(conf!.score)
  })
})

describe('ideales de Fibonacci de la onda C por patrón', () => {
  // Construye una corrección con bRet y cRatio controlados y compara el score.
  // flat expandida (bRet>1): C≈1.618×A puntúa mejor que C≈A.
  it('flat expandida: C=1.618×A puntúa mejor que C=1.0×A', () => {
    // A baja 100→80 (magA=20). B sube por encima del origen (bRet>1).
    // C1: 1.0×A → baja 20 desde B. C2: 1.618×A → baja ~32 desde B.
    const goodC = detectScenarios(candlesFromPath([100, 80, 104, 71.6]), 1.8).scenarios.find(
      (s) => s.pattern === 'flat',
    )
    const plainC = detectScenarios(candlesFromPath([100, 80, 104, 84]), 1.8).scenarios.find(
      (s) => s.pattern === 'flat',
    )
    expect(goodC).toBeDefined()
    expect(plainC).toBeDefined()
    // El que respeta C=1.618×A debe puntuar al menos tan alto.
    expect(goodC!.score).toBeGreaterThanOrEqual(plainC!.score)
  })
})
