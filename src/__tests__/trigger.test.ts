import { describe, it, expect } from 'vitest'
import { confirmationTrigger } from '@/domain/elliott/trigger'
import type { SrLevel } from '@/domain/elliott/levels'
import { mkPivot, mkScenario } from './helpers'

const lvl = (price: number, touches = 3, strength: SrLevel['strength'] = 'moderada'): SrLevel => ({
  price,
  touches,
  lastIndex: 10,
  low: price * 0.999,
  high: price * 1.001,
  strength,
})

/** Corrección bajista COMPLETADA → se opera al alza (reanudación). */
const largo = mkScenario({
  id: 'main',
  kind: 'correction',
  pattern: 'zigzag',
  direction: 'down',
  developing: false,
  pivots: [mkPivot(0, 110, 'high'), mkPivot(5, 96, 'low'), mkPivot(9, 104, 'high'), mkPivot(14, 94, 'low')],
})

describe('confirmationTrigger', () => {
  it('para una tesis alcista elige la resistencia MÁS CERCANA por encima', () => {
    const t = confirmationTrigger(largo, 100, [lvl(96), lvl(103), lvl(108)])
    expect(t).not.toBeNull()
    expect(t!.price).toBe(103)
    expect(t!.kind).toBe('resistencia')
    expect(t!.distancePct).toBeCloseTo(3, 1)
  })

  it('para una tesis bajista elige el soporte más cercano por debajo', () => {
    // Impulso alcista completado → giro a la baja.
    const corto = mkScenario({
      id: 'm2',
      kind: 'impulse',
      pattern: 'impulso',
      direction: 'up',
      developing: false,
      pivots: [mkPivot(0, 80, 'low'), mkPivot(3, 95, 'high'), mkPivot(5, 88, 'low'), mkPivot(9, 110, 'high'), mkPivot(12, 102, 'low'), mkPivot(16, 120, 'high')],
    })
    const t = confirmationTrigger(corto, 100, [lvl(97), lvl(92), lvl(104)])
    expect(t!.price).toBe(97)
    expect(t!.kind).toBe('soporte')
  })

  it('señala qué conteo CONTRARIO moriría al romper el disparador', () => {
    // Alternativo de venta cuya invalidación (102) queda entre el precio (100) y el
    // disparador (103): romperlo confirma el largo y mata el corto de una vez.
    const contrario = mkScenario({
      id: 'alt',
      kind: 'correction',
      pattern: 'flat',
      direction: 'up',
      developing: false, // plana alcista completada → sesgo de venta
      pivots: [mkPivot(0, 90, 'low'), mkPivot(4, 100, 'high'), mkPivot(8, 93, 'low'), mkPivot(12, 101, 'high')],
      invalidation: { price: 102, reason: 'test' },
    })
    const t = confirmationTrigger(largo, 100, [lvl(103)], [contrario])
    expect(t!.invalidates).toEqual(['Plana alcista'])
  })

  it('no cuenta conteos contrarios cuya invalidación queda MÁS ALLÁ del disparador', () => {
    const lejano = mkScenario({
      id: 'alt2',
      kind: 'correction',
      pattern: 'flat',
      direction: 'up',
      developing: false,
      pivots: [mkPivot(0, 90, 'low'), mkPivot(4, 100, 'high'), mkPivot(8, 93, 'low'), mkPivot(12, 101, 'high')],
      invalidation: { price: 120, reason: 'test' }, // el disparador (103) no llega
    })
    const t = confirmationTrigger(largo, 100, [lvl(103)], [lejano])
    expect(t!.invalidates).toEqual([])
  })

  it('devuelve null si no hay sesgo accionable o no hay niveles por delante', () => {
    const triangulo = mkScenario({
      id: 't',
      kind: 'correction',
      pattern: 'triangulo',
      direction: 'down',
      pivots: [mkPivot(0, 110, 'high'), mkPivot(4, 96, 'low')],
    })
    expect(confirmationTrigger(triangulo, 100, [lvl(103)])).toBeNull()
    // Tesis alcista pero todos los niveles quedan por debajo: no hay nada que romper.
    expect(confirmationTrigger(largo, 100, [lvl(95), lvl(90)])).toBeNull()
    expect(confirmationTrigger(largo, null, [lvl(103)])).toBeNull()
  })
})
