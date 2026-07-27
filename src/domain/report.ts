import type { Scenario, Confidence } from './elliott/types'
import type { FibZone } from './elliott/fibZone'
import type { SrLevel } from './elliott/levels'
import type { TargetCluster } from './elliott/targetClusters'
import type { AnchoredVwap } from './vwap'
import type { RegimeContext } from './indicators/adx'
import type { PreTradeChecklist } from './checklist'
import type { RiskPlan } from './risk'
import { scenarioBias } from './elliott/opportunity'
import { scoreToLikelihood, type Calibration } from './elliott/calibration'
import { waveRelations } from './elliott/relations'
import { classifyLevel } from './elliott/levels'
import { formatPrice } from '@/lib/format'

/** Una sección del informe: título + líneas ya redactadas. */
export interface ReportSection {
  title: string
  lines: string[]
}

export interface ReportInput {
  symbol: string
  timeframe: string
  /** Precio en vivo (último tick). */
  lastPrice: number | null | undefined
  /** Momento de generación, inyectado (mantiene la función pura y testeable). */
  now: Date
  scenarios: Scenario[]
  /** Escenario aislado por el usuario, si lo hay: el informe se centra en él. */
  focusedId?: string | null
  higher: { timeframe: string; bias: string; scenario: Scenario | null }
  regime?: RegimeContext | null
  fibZone?: FibZone | null
  vwap?: AnchoredVwap | null
  levels?: SrLevel[]
  clusters?: TargetCluster[]
  /** Fear & Greed (0-100) y su etiqueta. */
  sentiment?: { value: number; label: string } | null
  /** Lectura ya redactada de derivados + su alineación con el escenario. */
  derivatives?: { text: string; alignment: 'refuerza' | 'cautela' | 'neutral' } | null
  /** Calibración del motor sobre este par/TF (backtest walk-forward). */
  calibration?: Calibration | null
  developingCalibration?: Calibration | null
  risk?: RiskPlan | null
  checklist?: PreTradeChecklist | null
  /** Frescura de los datos, tal y como la muestra el badge de cabecera. */
  dataFreshness?: string | null
}

const CONFIDENCE_TEXT: Record<Confidence, string> = {
  alta: 'confianza alta',
  media: 'confianza media',
  baja: 'confianza baja',
}

const PATTERN_LABEL: Record<Scenario['pattern'], string> = {
  impulso: 'Impulso',
  diagonal: 'Diagonal',
  zigzag: 'Zigzag',
  flat: 'Plana',
  triangulo: 'Triángulo',
  wxy: 'Doble W-X-Y',
}

const BIAS_TEXT: Record<string, string> = {
  compra: 'sesgo de compra (largo)',
  venta: 'sesgo de venta (corto)',
  vigilar: 'sin sesgo accionable: vigilar',
}

const p = (n: number | null | undefined) => formatPrice(n)

/** "62.500 – 63.100" o "—" si la zona no es utilizable. */
function zoneText(z: { low: number; high: number } | undefined | null): string {
  if (!z || !Number.isFinite(z.low) || !Number.isFinite(z.high)) return '—'
  return z.low === z.high ? p(z.low) : `${p(z.low)} – ${p(z.high)}`
}

/** Situación del precio respecto a una zona, en lenguaje llano. */
function priceVsZone(price: number, z: { low: number; high: number }): string {
  if (price < z.low) return 'el precio está por debajo de la zona'
  if (price > z.high) return 'el precio está por encima de la zona'
  return 'el precio está DENTRO de la zona'
}

/**
 * ¿El precio EN VIVO ya rebasó la invalidación del conteo? Los escenarios se calculan
 * sobre velas CERRADAS, así que entre cierre y cierre el precio puede haber matado un
 * conteo que sigue en pantalla. Presentarlo entonces como "hipótesis de recambio" sería
 * engañoso: aquí se detecta para poder decirlo. El lado del rebase depende del sentido
 * en que se operaría (largo → invalida por debajo; corto → por encima).
 */
export function isInvalidated(s: Scenario, price: number | null | undefined): boolean {
  if (price == null || !Number.isFinite(price)) return false
  const b = scenarioBias(s)
  if (b === 'vigilar') return false
  return b === 'compra' ? price < s.invalidation.price : price > s.invalidation.price
}

function scenarioBlock(s: Scenario, price: number | null | undefined, cal: Calibration | null | undefined, rank: string): string[] {
  const bias = scenarioBias(s)
  const like = scoreToLikelihood(s.score, cal)
  const lines: string[] = []
  lines.push(
    `${rank} · ${PATTERN_LABEL[s.pattern]} ${s.direction === 'up' ? 'alcista' : 'bajista'}` +
      `${s.developing ? ' EN DESARROLLO (puede repintar)' : ' completado'} — ${CONFIDENCE_TEXT[s.confidence]}, score ${Math.round(s.score)}/100.`,
  )
  lines.push(s.narrative)
  lines.push(`Lectura del score: ${like.term}.`)
  if (like.calibrated && like.frequency) {
    lines.push(
      `Histórico del motor en esta banda de score: alcanzó su objetivo antes que la invalidación ${like.frequency.hits} de ${like.frequency.total} veces (muestra pequeña, no es una probabilidad).`,
    )
  }
  lines.push(`Sesgo derivado: ${BIAS_TEXT[bias] ?? bias}.`)
  lines.push(`Invalidación: ${p(s.invalidation.price)} — ${s.invalidation.reason}`)
  if (isInvalidated(s, price)) {
    lines.push(
      `Aviso: el precio actual (${p(price)}) YA ha rebasado esta invalidación — el conteo se calculó sobre velas cerradas y ha quedado superado. Descártalo hasta que el motor lo recalcule.`,
    )
  }
  if (s.target) {
    const inside = price != null ? ` (${priceVsZone(price, s.target)})` : ''
    lines.push(`Objetivo — ${s.target.label}: ${zoneText(s.target)}${inside}.`)
  } else {
    lines.push('Sin zona objetivo pendiente (estructura completada: se mide por reanudación, no por objetivo).')
  }
  const rels = waveRelations(s)
  if (rels.length > 0) {
    lines.push(
      'Relaciones de onda (Fibonacci): ' +
        rels.map((r) => `${r.label} = ${r.value}${r.fib ? ` (${r.fib})` : ''}`).join(' · ') +
        '.',
    )
  }
  for (const w of s.warnings) lines.push(`Aviso: ${w}`)
  return lines
}

/**
 * Construye el INFORME de situación con todo lo que la app ya ha calculado: escenarios de
 * Elliott, confluencia factor a factor, contexto (marco superior, régimen, sentimiento,
 * derivados), estructura (VWAP, soportes/resistencias, Fibonacci, convergencia), plan de
 * riesgo y fiabilidad histórica del motor.
 *
 * Es una AGREGACIÓN determinista de datos ya visibles en el panel — no añade cálculos ni
 * juicios nuevos, y por tanto no puede "opinar" más que la propia herramienta. Mantiene la
 * regla del proyecto: escenarios y zonas con su invalidación, nunca una señal de compra/venta.
 */
export function buildAnalysisReport(i: ReportInput): ReportSection[] {
  const sections: ReportSection[] = []
  const focused = i.focusedId ? i.scenarios.find((s) => s.id === i.focusedId) : undefined
  const main = focused ?? i.scenarios[0]

  // --- 1. Situación -------------------------------------------------------------------
  const head: string[] = [
    `${i.symbol} · temporalidad ${i.timeframe} · informe generado el ${i.now.toLocaleString('es-ES')}.`,
    `Último precio: ${p(i.lastPrice)}.`,
  ]
  if (i.dataFreshness) head.push(`Datos: ${i.dataFreshness}.`)
  if (focused) head.push('El informe se centra en el conteo AISLADO en el gráfico.')
  if (!main) {
    head.push(
      'No se detecta una estructura de Elliott clara con la sensibilidad actual: no hay conteo que analizar. Prueba a cambiar el grado de onda o la temporalidad.',
    )
    sections.push({ title: 'Situación', lines: head })
    sections.push({ title: 'Aviso', lines: [DISCLAIMER] })
    return sections
  }
  sections.push({ title: 'Situación', lines: head })

  // --- 2. Lectura rápida --------------------------------------------------------------
  const bias = scenarioBias(main)
  const quick: string[] = [
    `Conteo principal: ${PATTERN_LABEL[main.pattern]} ${main.direction === 'up' ? 'alcista' : 'bajista'}${main.developing ? ' en desarrollo' : ' completado'} · ${CONFIDENCE_TEXT[main.confidence]}.`,
    `${BIAS_TEXT[bias] ?? bias}. Se invalida en ${p(main.invalidation.price)}.`,
  ]
  if (main.target) quick.push(`Zona objetivo: ${zoneText(main.target)}.`)
  quick.push(
    `Confluencia: ${main.confluence.factors.filter((f) => f.met).length} de ${main.confluence.factors.length} factores a favor.`,
  )
  if (isInvalidated(main, i.lastPrice)) {
    quick.push(
      `ATENCIÓN: el precio ya ha rebasado la invalidación de este conteo. La lectura de abajo está caducada hasta que cierre la vela y el motor recalcule.`,
    )
  }
  const alts = i.scenarios.filter((s) => s.id !== main.id)
  if (alts.length > 0) {
    const live = alts.filter((s) => !isInvalidated(s, i.lastPrice))
    const dead = alts.length - live.length
    if (live.length > 0) {
      quick.push(
        `Hay ${live.length} conteo(s) alternativo(s) vigente(s): ${live
          .map((s) => `${PATTERN_LABEL[s.pattern]} ${s.direction === 'up' ? 'alcista' : 'bajista'} (${BIAS_TEXT[scenarioBias(s)] ?? ''})`)
          .join('; ')}. Si el principal se invalida, son la hipótesis de recambio.`,
      )
    }
    // Nunca presentar como "recambio" un conteo que el precio ya ha matado.
    if (dead > 0) {
      quick.push(
        `Otros ${dead} conteo(s) alternativo(s) aparecen abajo pero el precio YA rebasó su invalidación: no son recambio real.`,
      )
    }
  }
  sections.push({ title: 'Lectura rápida', lines: quick })

  // --- 3. Escenarios ------------------------------------------------------------------
  const scen: string[] = []
  scen.push(...scenarioBlock(main, i.lastPrice, i.calibration, 'PRINCIPAL'))
  for (const s of i.scenarios.filter((x) => x.id !== main.id)) {
    scen.push('')
    scen.push(...scenarioBlock(s, i.lastPrice, i.calibration, 'ALTERNATIVO'))
  }
  sections.push({ title: 'Escenarios', lines: scen })

  // --- 4. Confluencia del conteo principal --------------------------------------------
  const conf: string[] = [
    `Factores evaluados sobre el conteo principal (${main.confluence.factors.filter((f) => f.met).length}/${main.confluence.factors.length} cumplidos):`,
    'Se miden EN EL GIRO de la estructura (sin look-ahead), no ahora: por eso un ADX/ATR de esta lista puede no coincidir con el régimen actual del apartado Contexto — miden momentos distintos, no se contradicen.',
  ]
  for (const f of main.confluence.factors) {
    conf.push(`${f.met ? '[✓]' : '[✗]'} ${f.label}${f.detail ? ` — ${f.detail}` : ''}`)
  }
  sections.push({ title: 'Confluencia', lines: conf })

  // --- 5. Contexto de mercado ---------------------------------------------------------
  const ctx: string[] = []
  ctx.push(
    `Marco superior (${i.higher.timeframe}): ${i.higher.bias}${
      i.higher.scenario ? ` — conteo dominante: ${i.higher.scenario.title}` : ''
    }.`,
  )
  if (i.regime) ctx.push(`Régimen: ${i.regime.label} (${i.regime.detail}). Describe el entorno, no la dirección.`)
  if (i.sentiment) ctx.push(`Sentimiento (Fear & Greed): ${i.sentiment.value} · ${i.sentiment.label}.`)
  if (i.derivatives) ctx.push(`Derivados: ${i.derivatives.text} Lectura frente al escenario: ${i.derivatives.alignment}.`)
  if (ctx.length > 0) sections.push({ title: 'Contexto de mercado', lines: ctx })

  // --- 6. Estructura ------------------------------------------------------------------
  const str: string[] = []
  if (i.vwap && i.lastPrice != null && Number.isFinite(i.vwap.current)) {
    const diff = ((i.lastPrice - i.vwap.current) / i.vwap.current) * 100
    str.push(
      `VWAP anclado al origen del conteo: ${p(i.vwap.current)} · el precio está ${diff >= 0 ? '+' : ''}${diff.toFixed(1)}% ${
        diff >= 0 ? 'por encima (compradores dominan desde el origen)' : 'por debajo (vendedores dominan desde el origen)'
      }.`,
    )
  }
  if (i.levels && i.levels.length > 0 && i.lastPrice != null) {
    str.push('Niveles donde el precio ya ha reaccionado:')
    for (const l of i.levels) {
      const kind = classifyLevel(l, i.lastPrice)
      str.push(`  · ${kind === 'soporte' ? 'Soporte' : kind === 'resistencia' ? 'Resistencia' : 'En precio'} ${p(l.price)} — zona ${l.strength}, ${l.touches} toques.`)
    }
  }
  if (i.fibZone) {
    str.push(
      `Zona de retroceso Fibonacci (0.382–0.618): ${p(i.fibZone.bandLow)} – ${p(i.fibZone.bandHigh)} · ${
        i.fibZone.broken ? 'ROTA (el precio superó el 0.786: el conteo del impulso pierde fuerza)' : 'intacta'
      }.`,
    )
  }
  if (i.clusters && i.clusters.length > 0) {
    str.push('Convergencia de objetivos (varios conteos apuntan a la misma zona):')
    for (const c of i.clusters) str.push(`  · ${zoneText(c.zone)} — ${c.count} conteos (${c.sources.join(', ')}).`)
    str.push('Convergen por geometría compartida (mismos pivotes y ratios), no por confirmación independiente.')
  }
  if (str.length > 0) sections.push({ title: 'Estructura de mercado', lines: str })

  // --- 7. Riesgo ----------------------------------------------------------------------
  const risk: string[] = []
  if (i.risk) {
    risk.push(
      `Plan sobre el conteo principal (${i.risk.bias}): entrada ${p(i.risk.entry)} · stop ${p(i.risk.stop)} (${i.risk.stopLabel}) · objetivo ${p(i.risk.targetNear)}.`,
    )
    risk.push(
      // stopDistPct viene como FRACCIÓN (stopDist/price), igual que en la calculadora: ×100.
      `Distancia al stop ${(i.risk.stopDistPct * 100).toFixed(2)}% · R:R ${i.risk.rr != null ? `1:${i.risk.rr.toFixed(2)}` : 'indefinido'} · posición ${p(i.risk.positionNotional)} USDC (${i.risk.positionUnits.toPrecision(4)} unidades) para arriesgar ${p(i.risk.riskAmount)} USDC.`,
    )
    for (const w of i.risk.warnings) risk.push(`Aviso: ${w}`)
  } else {
    risk.push(
      'Este escenario no tiene un sesgo direccional accionable ahora (o el precio ya superó la invalidación): la calculadora no propone plan.',
    )
  }
  if (i.checklist) {
    risk.push(`Checklist pre-entrada — grado ${i.checklist.grade}:`)
    for (const f of i.checklist.flags) {
      const mark = f.status === 'ok' ? '[✓]' : f.status === 'against' ? '[✗]' : f.status === 'warn' ? '[~]' : '[–]'
      risk.push(`  ${mark} ${f.detail}`)
    }
    risk.push('El grado mide la DISCIPLINA de la entrada (condiciones alineadas), no la probabilidad de acierto.')
  }
  sections.push({ title: 'Riesgo', lines: risk })

  // --- 8. Fiabilidad del motor --------------------------------------------------------
  const rel: string[] = []
  if (i.developingCalibration && i.developingCalibration.hitRate != null) {
    rel.push(
      `Pronósticos EN DESARROLLO en este par/TF: alcanzaron su objetivo antes que la invalidación ${i.developingCalibration.hits} de ${i.developingCalibration.total} veces.`,
    )
  }
  if (i.calibration && i.calibration.hitRate != null) {
    rel.push(
      `Conteos CONFIRMADOS: alcanzaron su zona objetivo antes que la invalidación ${i.calibration.hits} de ${i.calibration.total} veces.`,
    )
  }
  if (rel.length > 0) {
    rel.push(
      'Backtest walk-forward sin look-ahead, muestra pequeña por par. Mide si el conteo llegó a su objetivo antes que a su invalidación — NO el resultado del plan de riesgo de arriba, cuyo stop y objetivo pueden ser otros niveles. Mide la utilidad del conteo, no la rentabilidad. El pasado no garantiza el futuro.',
    )
    sections.push({ title: 'Fiabilidad histórica del motor', lines: rel })
  }

  sections.push({ title: 'Aviso', lines: [DISCLAIMER] })
  return sections
}

const DISCLAIMER =
  'Este informe es análisis probabilístico, NO una recomendación de compra o venta. El conteo de Elliott es subjetivo y puede fallar o cambiar con nuevas velas; los niveles son zonas, no precios exactos. Cada usuario es responsable de sus decisiones y de su gestión de riesgo.'

/** Convierte el informe a Markdown (para copiar al portapapeles o pegarlo en otra herramienta). */
export function reportToMarkdown(sections: ReportSection[], title = 'Informe de situación'): string {
  const out: string[] = [`# ${title}`, '']
  for (const s of sections) {
    out.push(`## ${s.title}`)
    for (const l of s.lines) out.push(l === '' ? '' : l)
    out.push('')
  }
  return out.join('\n').trim()
}
