import { describe, it, expect } from 'vitest'
import { buildAnalysisReport, reportToMarkdown, type ReportInput } from '@/domain/report'
import { mkPivot, mkScenario } from './helpers'
import type { Scenario } from '@/domain/elliott/types'

/** Zigzag bajista completado (P0..P3), con confluencia y objetivo. */
function zigzag(over: Partial<Scenario> = {}): Scenario {
  return mkScenario({
    kind: 'correction',
    pattern: 'zigzag',
    direction: 'down',
    id: 'zz1',
    title: 'Posible corrección zigzag bajista',
    narrative: 'Corrección ABC a la baja.',
    score: 72,
    confidence: 'alta',
    pivots: [mkPivot(0, 100, 'high'), mkPivot(5, 90, 'low'), mkPivot(9, 96, 'high'), mkPivot(14, 86, 'low')],
    invalidation: { price: 100, reason: 'Superar el origen invalida el conteo.' },
    confluence: {
      score: 2,
      max: 3,
      factors: [
        { key: 'estructura', label: 'Estructura ABC coherente', met: true },
        { key: 'volB', label: 'Clímax VSA al final de C', met: false, detail: 'Sin firma VSA de giro.' },
        { key: 'rsiC', label: 'RSI bajo al final de C', met: true, detail: 'RSI 32' },
      ],
    },
    ...over,
  })
}

const baseInput = (over: Partial<ReportInput> = {}): ReportInput => ({
  symbol: 'BTCUSDC',
  timeframe: '1h',
  lastPrice: 88,
  now: new Date('2026-07-24T12:00:00Z'),
  scenarios: [zigzag()],
  higher: { timeframe: '4h', bias: 'alcista', scenario: null },
  ...over,
})

/** Todo el texto del informe en una sola cadena (para aserciones de contenido). */
const flat = (i: ReportInput) =>
  buildAnalysisReport(i)
    .flatMap((s) => [s.title, ...s.lines])
    .join('\n')

describe('buildAnalysisReport', () => {
  it('incluye el aviso de riesgo SIEMPRE (no-oráculo)', () => {
    expect(flat(baseInput())).toContain('NO una recomendación de compra o venta')
    // También cuando no hay ningún conteo que analizar.
    expect(flat(baseInput({ scenarios: [] }))).toContain('NO una recomendación de compra o venta')
  })

  it('sin escenarios explica que no hay estructura, sin inventar análisis', () => {
    const text = flat(baseInput({ scenarios: [] }))
    expect(text).toContain('No se detecta una estructura de Elliott clara')
    expect(text).not.toContain('Confluencia')
    expect(text).not.toContain('Escenarios')
  })

  it('recoge el conteo principal con su invalidación y su sesgo', () => {
    const text = flat(baseInput())
    expect(text).toContain('Zigzag bajista')
    // Zigzag bajista COMPLETADO → reanudación al alza → sesgo de compra.
    expect(text).toContain('sesgo de compra')
    expect(text).toContain('Invalidación')
    expect(text).toContain('Superar el origen invalida el conteo.')
  })

  it('lista los factores de confluencia con su marca de cumplido/no cumplido', () => {
    const text = flat(baseInput())
    expect(text).toContain('[✓] Estructura ABC coherente')
    expect(text).toContain('[✗] Clímax VSA al final de C — Sin firma VSA de giro.')
    expect(text).toContain('2/3 cumplidos')
  })

  it('marca los conteos EN DESARROLLO como repintables', () => {
    const dev = zigzag({ developing: true, id: 'zz-dev' })
    expect(flat(baseInput({ scenarios: [dev] }))).toContain('EN DESARROLLO (puede repintar)')
  })

  it('con focusedId centra el informe en el conteo aislado', () => {
    const alt = zigzag({ id: 'alt', pattern: 'flat', title: 'Plana', direction: 'up' })
    const text = flat(baseInput({ scenarios: [zigzag(), alt], focusedId: 'alt' }))
    expect(text).toContain('El informe se centra en el conteo AISLADO')
    // El aislado pasa a ser el PRINCIPAL del informe.
    const principal = text.slice(text.indexOf('PRINCIPAL'))
    expect(principal.slice(0, 60)).toContain('Plana')
  })

  it('sitúa el precio respecto a la zona objetivo', () => {
    const withTarget = zigzag({ target: { label: 'zona ABC', low: 80, high: 90 } })
    // lastPrice 88 cae dentro de 80–90.
    expect(flat(baseInput({ scenarios: [withTarget] }))).toContain('el precio está DENTRO de la zona')
    // Y por encima si el precio se va arriba.
    expect(flat(baseInput({ scenarios: [withTarget], lastPrice: 95 }))).toContain(
      'el precio está por encima de la zona',
    )
  })

  it('incluye contexto, estructura y riesgo cuando hay datos', () => {
    const text = flat(
      baseInput({
        regime: { adx: 31, atrPct: 0.88, trend: 'tendencia-fuerte', vol: 'expansion', label: 'Tendencia fuerte · expansión', detail: 'ADX 31 · ATR p88' },
        sentiment: { value: 22, label: 'MIEDO EXTREMO' },
        derivatives: { text: 'funding positivo; open interest estable.', alignment: 'neutral' },
        levels: [{ price: 92, touches: 3, lastIndex: 10, low: 91.5, high: 92.5, strength: 'fuerte' }],
        fibZone: { fromTs: 0, toTs: 1, levels: [], bandLow: 89, bandHigh: 94, broken: false, direction: 'down' },
        clusters: [{ zone: { label: 'z', low: 85, high: 87 }, count: 2, sources: ['zigzag', 'plana'] }],
      }),
    )
    expect(text).toContain('Marco superior (4h): alcista')
    expect(text).toContain('ADX 31 · ATR p88')
    expect(text).toContain('MIEDO EXTREMO')
    expect(text).toContain('Resistencia') // nivel 92 por encima del precio 88
    expect(text).toContain('3 toques')
    expect(text).toContain('intacta') // fibZone no rota
    expect(text).toContain('2 conteos')
  })

  it('sin plan de riesgo lo dice en vez de inventar números', () => {
    expect(flat(baseInput({ risk: null }))).toContain('no propone plan')
  })

  it('avisa cuando el precio YA rebasó la invalidación de un conteo', () => {
    // Zigzag bajista completado → se opera al alza; invalida por DEBAJO (100 aquí).
    // Con el precio en 95 el conteo está muerto aunque siga en pantalla (se calcula
    // sobre velas cerradas), así que el informe debe decirlo.
    const s = zigzag({ invalidation: { price: 100, reason: 'test' } })
    const text = flat(baseInput({ scenarios: [s], lastPrice: 95 }))
    expect(text).toContain('YA ha rebasado esta invalidación')
    expect(text).toContain('lectura de abajo está caducada')
  })

  it('no presenta como "recambio" alternativos que el precio ya invalidó', () => {
    const principal = zigzag({ id: 'main', invalidation: { price: 80, reason: 'test' } })
    // Alternativo ya muerto: se opera al alza e invalida en 100, con el precio en 88.
    const muerto = zigzag({ id: 'alt', invalidation: { price: 100, reason: 'test' } })
    const text = flat(baseInput({ scenarios: [principal, muerto], lastPrice: 88 }))
    expect(text).toContain('no son recambio real')
    expect(text).not.toContain('conteo(s) alternativo(s) vigente(s)')
  })

  it('muestra la distancia al stop en PORCENTAJE (stopDistPct es una fracción)', () => {
    // Regresión: stopDistPct = stopDist/price (0.0279 = 2.79%). Sin el ×100 el informe
    // decía "0.03%" para un stop al 2.79%, subestimando el riesgo ~100 veces.
    const text = flat(
      baseInput({
        risk: {
          bias: 'compra',
          entry: 65_494.92,
          stop: 63_668.52,
          stopLabel: 'extremo de la corrección',
          stopLevel: 63_668.52,
          stopBuffer: 0,
          stopBufferAtr: 0,
          targetNear: 67_000,
          targetFar: null,
          targetLabel: 'origen de la corrección (imán al reanudarse la tendencia)',
          riskAmount: 10,
          stopDistPct: 0.0279,
          positionNotional: 358.6,
          positionUnits: 0.005475,
          rr: 0.82,
          leverage: 0.36,
          warnings: [],
        },
      }),
    )
    expect(text).toContain('Distancia al stop 2.79%')
    expect(text).not.toContain('0.03%')
    // El objetivo debe declarar DE DÓNDE sale: sin eso parecía un número prestado de otro
    // conteo (el zigzag completado dice "sin zona objetivo pendiente" y aun así hay target).
    expect(text).toContain('origen de la corrección')
  })

  it('advierte de que los contadores del backtest van sobre ventana rodante', () => {
    const cal = { total: 10, hits: 7, hitRate: 0.7, buckets: [], factorStats: [] }
    const text = flat(baseInput({ calibration: cal }))
    expect(text).toContain('VENTANA RODANTE')
    expect(text).toContain('pueden subir o BAJAR')
  })
})

describe('reportToMarkdown', () => {
  it('genera Markdown con título y secciones', () => {
    const md = reportToMarkdown(buildAnalysisReport(baseInput()), 'Informe BTC')
    expect(md.startsWith('# Informe BTC')).toBe(true)
    expect(md).toContain('## Situación')
    expect(md).toContain('## Escenarios')
    expect(md).toContain('## Aviso')
  })
})
