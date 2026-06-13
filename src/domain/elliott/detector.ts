import type { Candle } from '@/types/market'
import { computeIndicators, type Indicators } from '@/domain/indicators'
import type { Confidence, Confluence, Direction, Pivot, PriceZone, Scenario, WaveLabel } from './types'
import { zigzag, williamsFilter } from './zigzag'
import { wave5ChannelTarget } from './channel'
import { fibScore, FIB_IDEALS } from './fibonacci'
import {
  evaluateAbcConfluence,
  evaluateImpulseConfluence,
  evaluateTriangleConfluence,
  weightedMetPct,
} from './confluence'

const fmt = (n: number) => n.toLocaleString('es-ES', { maximumFractionDigits: 8 })

function confidenceOf(score: number): Confidence {
  if (score >= 65) return 'alta'
  if (score >= 45) return 'media'
  return 'baja'
}

/**
 * Mezcla el score estructural (Fibonacci/reglas) con el de confluencia (indicadores).
 * Un conteo `developing` (última onda sin confirmar, repintable) ve su score
 * descontado: su evidencia es provisional y no debe rankear igual que uno cerrado.
 */
function blend(
  structural: number,
  confluence: Confluence,
  developing = false,
): { score: number; confidence: Confidence } {
  // Score de confluencia PONDERADO: cada factor aporta su peso (default 1), así
  // los más informativos (divergencia, MACD) pesan más que los tautológicos.
  const confPct = weightedMetPct(confluence.factors)
  let score = Math.round(0.5 * structural + 0.5 * confPct)
  if (developing) score = Math.round(score * 0.85)
  return { score, confidence: confidenceOf(score) }
}

/** Valor con signo según dirección: en "up" trabajamos con el precio tal cual,
 * en "down" lo invertimos para que el impulso sea siempre "creciente". */
const val = (p: Pivot, dir: Direction) => (dir === 'up' ? p.price : -p.price)

function labelsFor(pivots: Pivot[], texts: string[]): WaveLabel[] {
  // texts alineado a pivots[1..] (la onda termina en cada pivote; P0 es el origen).
  return texts.map((text, i) => {
    const p = pivots[i + 1]
    return { text, timestamp: p.timestamp, price: p.price, above: p.type === 'high' }
  })
}

interface Scored {
  score: number
  warnings: string[]
}

/** Valida las 3 reglas cardinales del impulso y puntúa por Fibonacci. */
function scoreImpulse(p: Pivot[], dir: Direction): Scored | null {
  const v = (i: number) => val(p[i], dir)
  const w1 = v(1) - v(0)
  const w3 = v(3) - v(2)
  const w5 = v(5) - v(4)

  // Direccionalidad mínima (las ondas motrices avanzan, las correctivas retroceden).
  if (w1 <= 0 || w3 <= 0 || w5 <= 0) return null
  if (v(2) >= v(1) || v(4) >= v(3)) return null

  // Regla 1: onda 2 no retrocede > 100% de onda 1.
  if (v(2) <= v(0)) return null
  // Onda 3 supera el final de onda 1.
  if (v(3) <= v(1)) return null
  // Regla 3: onda 4 no solapa el territorio de la onda 1.
  if (v(4) <= v(1)) return null
  // Regla 2: onda 3 nunca es la más corta.
  if (w3 < w1 && w3 < w5) return null

  const warnings: string[] = []
  // Truncamiento de onda 5 (no supera el extremo de la 3): permitido pero penaliza.
  const truncated = v(5) <= v(3)
  if (truncated) warnings.push('Onda 5 truncada (no supera la onda 3): posible debilidad/reversión.')

  const ret2 = (v(1) - v(2)) / w1
  const ext3 = w3 / w1
  const ret4 = (v(3) - v(4)) / w3
  const ext5 = w5 / w1

  // Onda 5 contra sus tres relaciones clásicas: ≈W1 (igualdad), 0.618×W3, y
  // 0.618×(W1+W3) medida desde el fin de W4 (Frost & Prechter). Se premia la mejor.
  const w5Score = Math.max(
    fibScore(ext5, FIB_IDEALS.wave5),
    fibScore(w5 / w3, [0.618]),
    fibScore(w5 / (w1 + w3), [0.618]),
  )

  const fib =
    (fibScore(ret2, FIB_IDEALS.wave2Retrace) +
      fibScore(ext3, FIB_IDEALS.wave3Extension) +
      fibScore(ret4, FIB_IDEALS.wave4Retrace) +
      w5Score) /
    4

  const wave3Longest = w3 >= w1 && w3 >= w5 ? 1 : 0

  // Alternancia (guideline de Frost & Prechter). La más fiable es por FORMA:
  // una corrección "sharp" (corta en tiempo y profunda) alterna con una "sideways"
  // (larga y poco profunda). Se aproxima con duración + profundidad de W2 y W4.
  const dur2 = p[2].index - p[1].index
  const dur4 = p[4].index - p[3].index
  const depthAlternates = ret2 - ret4 > 0.15 // la 2 típicamente más profunda que la 4
  const formAlternates =
    (ret2 >= 0.5 && ret4 <= 0.5 && dur4 >= dur2) || // 2 sharp + 4 sideways
    (ret2 <= 0.5 && ret4 >= 0.5 && dur2 >= dur4) // 2 sideways + 4 sharp
  // Fallback DIRECCIONAL: solo premia la diferencia de profundidad cuando va en
  // el sentido típico (W2 más profunda que W4); W4 más profunda no se recompensa.
  const dirDepth = Math.max(0, Math.min(1, (ret2 - ret4) / 0.3))
  const alternation = formAlternates ? 1 : depthAlternates ? 0.75 : dirDepth * 0.5

  let score = 100 * (0.6 * fib + 0.25 * wave3Longest + 0.15 * alternation)
  if (truncated) score *= 0.8
  // W4 más profunda que W2 es atípico en un impulso sano: penaliza (no invalida).
  if (ret4 > ret2 + 0.1) score *= 0.9

  // Regla de extensión única: normalmente solo UNA onda motriz se extiende.
  // Tomando W1 como base, W3 y W5 "extendidas" si superan 1.618×W1. Si ambas
  // lo están, suele ser mala segmentación de pivotes → penaliza y avisa.
  const extendedCount = [ext3 > 1.618, ext5 > 1.618].filter(Boolean).length
  if (extendedCount >= 2) {
    score *= 0.85
    warnings.push('Varias ondas parecen extendidas: posible mala segmentación del conteo.')
  }

  return { score: Math.round(score), warnings }
}

function buildImpulse(
  p: Pivot[],
  dir: Direction,
  scored: Scored,
  candles: Candle[],
  ind: Indicators,
): Scenario {
  const v = (i: number) => val(p[i], dir)
  const w1 = v(1) - v(0)
  const sign = dir === 'up' ? 1 : -1
  const developing = !p[5].confirmed
  const up = dir === 'up'

  const warnings = [...scored.warnings]
  if (developing) warnings.push('Última onda sin confirmar: puede repintar al llegar nuevas velas.')

  let title: string
  let invalidation: { price: number; reason: string }
  let target: PriceZone | undefined
  let narrative: string

  const dirWord = up ? 'alcista' : 'bajista'

  if (developing) {
    title = `Posible impulso ${dirWord} — onda 5 en desarrollo`
    invalidation = {
      price: p[4].price,
      reason: `Perder el nivel de la onda 4 (${fmt(p[4].price)}) invalidaría la onda 5 en curso.`,
    }
    // Proyección de onda 5: por defecto entre 0.618×onda1 e igualdad con onda1.
    // Si la onda 5 en curso YA superó esa zona (onda 5 extendida), se escala a la
    // siguiente extensión de Fibonacci — sin esto, la zona quedaría por detrás
    // del precio y la proyección apuntaría hacia atrás.
    const LADDER: [number, number][] = [
      [0.618, 1],
      [1, 1.618],
      [1.618, 2.618],
      [2.618, 4.236],
    ]
    const wave5SoFar = v(5) - v(4)
    const pick = LADDER.find(([, hi]) => hi * w1 > wave5SoFar) ?? LADDER[LADDER.length - 1]
    if (pick !== LADDER[0]) {
      warnings.push('Onda 5 extendida: objetivo escalado a la siguiente extensión de Fibonacci.')
    }
    const a = p[4].price + sign * pick[0] * w1
    const b = p[4].price + sign * pick[1] * w1
    // En desplomes (onda 1 enorme) la zona bajista puede salir negativa: se
    // acota a ≥0, y si la zona entera carece de sentido se omite.
    const hi5 = Math.max(a, b)
    target = hi5 <= 0 ? undefined : { label: 'Zona objetivo onda 5', low: Math.max(Math.min(a, b), 0), high: hi5 }
    // Confluencia con la canalización (Frost & Prechter): si la paralela del canal
    // proyecta la onda 5 dentro de la zona Fibonacci, ambos métodos coinciden.
    const channelTarget = wave5ChannelTarget(p, dir)
    const channelConfluence =
      channelTarget != null && target != null && channelTarget >= target.low && channelTarget <= target.high
    narrative =
      `Se observa una estructura de 5 ondas ${dirWord} con la onda 5 aún formándose. ` +
      `Las 3 reglas cardinales se cumplen. La zona objetivo es orientativa (extensión de Fibonacci de la onda 1` +
      (channelConfluence ? ', coincide con la proyección del canal de Elliott' : '') +
      `); vigila divergencias de RSI/MACD y caída de volumen como señales de agotamiento del impulso.`
  } else {
    title = `Posible impulso ${dirWord} completado — atención a corrección ABC`
    invalidation = {
      price: p[5].price,
      reason: `Un movimiento más allá de la onda 5 (${fmt(p[5].price)}) sugeriría extensión, no fin del impulso.`,
    }
    const range = v(5) - v(0)
    const a = p[5].price - sign * 0.382 * range
    const b = p[5].price - sign * 0.618 * range
    target = { label: 'Zona de corrección ABC esperada', low: Math.min(a, b), high: Math.max(a, b) }
    narrative =
      `La estructura de 5 ondas ${dirWord} parece completa y respeta las 3 reglas cardinales. ` +
      `Tras un impulso suele venir una corrección ABC hacia la zona 0.382–0.618 del recorrido. ` +
      `No es una señal de entrada: es un mapa de escenarios con su nivel de invalidación.`
  }

  const factors = evaluateImpulseConfluence(candles, ind, p, dir)
  const confluence: Confluence = {
    score: factors.filter((f) => f.met).length,
    max: factors.length,
    factors,
  }
  const { score, confidence } = blend(scored.score, confluence, developing)

  return {
    id: `impulse-${dir}-${p[0].index}-${p[5].index}`,
    kind: 'impulse',
    pattern: 'impulso',
    direction: dir,
    title,
    pivots: p,
    labels: labelsFor(p, ['1', '2', '3', '4', '5']),
    score,
    confidence,
    confluence,
    developing,
    invalidation,
    target,
    narrative,
    warnings,
  }
}

/** Valida y puntúa una corrección ABC (zigzag o flat según el retroceso de B). */
function scoreAbc(p: Pivot[], dir: Direction): Scored | null {
  const v = (i: number) => val(p[i], dir)
  // Corrección "dir" = A y C se mueven EN sentido dir (positivo en espacio val); B contra.
  const a = v(1) - v(0) // onda A
  const c = v(3) - v(2) // onda C
  if (a <= 0 || c <= 0) return null
  const b = v(2) - v(1) // onda B (rebote, contra dir → negativo)
  if (b >= 0) return null

  const magA = a
  const bRet = -b / magA // retroceso de B sobre A (0..~1.38)
  const cRatio = c / magA
  // Permitimos hasta 1.382 para flats expandidos (B supera el inicio de A).
  if (bRet < 0.382 || bRet > 1.382) return null

  // Ideales de C según la FORMA realmente detectada (no una mezcla genérica):
  // zigzag → C ≈ A ó 1.618×A; flat regular → C ≈ A; flat expandida → C ≈ 1.618×A.
  const cIdeals = bRet > 1.0 ? [1.618] : bRet >= 0.886 ? [1.0] : [1.0, 1.618]

  const fib = (fibScore(bRet, FIB_IDEALS.bRetrace) + fibScore(cRatio, cIdeals)) / 2
  const score = Math.round(100 * (0.7 * fib + 0.3))
  return { score, warnings: [] }
}

function buildAbc(
  p: Pivot[],
  dir: Direction,
  scored: Scored,
  candles: Candle[],
  ind: Indicators,
): Scenario {
  const v = (i: number) => val(p[i], dir)
  const bRet = (v(1) - v(2)) / (v(1) - v(0))
  const expanded = bRet > 1.0
  const isFlat = bRet >= 0.886
  const pattern: 'zigzag' | 'flat' = isFlat ? 'flat' : 'zigzag'
  const patternWord = isFlat ? (expanded ? 'plana expandida' : 'plana (flat)') : 'zigzag'

  const developing = !p[3].confirmed
  const down = dir === 'down'
  const dirWord = down ? 'bajista' : 'alcista'
  const warnings: string[] = []
  if (developing) warnings.push('Onda C sin confirmar: puede repintar al llegar nuevas velas.')

  // En una plana expandida la onda B ya superó el origen por construcción, así
  // que el origen no sirve como invalidación: se usa el extremo de la onda B.
  const invalidation = expanded
    ? {
        price: p[2].price,
        reason: `Superar el extremo de la onda B (${fmt(p[2].price)}) invalidaría el conteo de plana expandida.`,
      }
    : {
        price: p[0].price,
        reason: `Superar el origen de la corrección (${fmt(p[0].price)}) invalidaría el conteo ${patternWord}.`,
      }

  const narrative = isFlat
    ? `Posible corrección ${patternWord} ${dirWord} (3-3-5): la onda B retrocede casi toda la onda A, ` +
      `estructura lateral. Al completar la onda C suele reanudarse la tendencia previa; confirma con ruptura y volumen.`
    : `Posible corrección ABC ${dirWord} (zigzag 5-3-5), directa y profunda. ` +
      `Al completarse suele reanudarse la tendencia previa; confirma con ruptura y volumen. ` +
      `Mantén este conteo como escenario, no como certeza.`

  const factors = evaluateAbcConfluence(candles, ind, p, dir)
  const confluence: Confluence = {
    score: factors.filter((f) => f.met).length,
    max: factors.length,
    factors,
  }
  const { score, confidence } = blend(scored.score, confluence, developing)

  return {
    id: `${pattern}-${dir}-${p[0].index}-${p[3].index}`,
    kind: 'correction',
    pattern,
    direction: dir,
    title: developing
      ? `Posible corrección ${patternWord} ${dirWord} — onda C en desarrollo`
      : `Posible corrección ${patternWord} ${dirWord}`,
    pivots: p,
    labels: labelsFor(p, ['A', 'B', 'C']),
    score,
    confidence,
    confluence,
    developing,
    invalidation,
    narrative,
    warnings,
  }
}

/**
 * Combinación correctiva doble W-X-Y (double three): dos correcciones (W e Y,
 * cada una un ABC) unidas por una onda X conectora. 8 pivotes (P0..P7):
 * W = P0..P3, X = P3→P4 (contra dir, parcial), Y = P4..P7. Reutiliza scoreAbc
 * para validar W e Y; el resto es scoring SUAVE (Fibonacci gaussiano).
 */
function scoreWxy(p: Pivot[], dir: Direction): Scored | null {
  if (p.length !== 8) return null
  const v = (i: number) => val(p[i], dir)

  const scW = scoreAbc(p.slice(0, 4), dir) // W = P0..P3
  if (!scW) return null
  const wMag = v(3) - v(0)
  if (wMag <= 0) return null

  const x = v(4) - v(3) // onda X: debe retroceder CONTRA dir (negativo en espacio val)
  if (x >= 0) return null
  // X no debe deshacer toda W (si supera el origen, es reinicio de corrección, no conector).
  if (v(4) <= v(0)) return null

  const scY = scoreAbc(p.slice(4, 8), dir) // Y = P4..P7
  if (!scY) return null

  const xRet = -x / wMag
  const yMag = v(7) - v(4)
  const xScore = fibScore(xRet, [0.382, 0.5, 0.618, 0.786]) // X parcial (Frost & Prechter)
  const yEqW = fibScore(yMag / wMag, [0.618, 1.0, 1.618]) // Y ≈ W (lo típico) / menor / extendida
  const internal = (scW.score + scY.score) / 200 // calidad media de los dos ABC (0..1)

  // 50% calidad interna de los dos three + 30% retroceso de X + 20% proporción Y/W.
  // Descuento base ×0.9: una doble es más ambigua que un ABC simple.
  const score = Math.round(0.9 * 100 * (0.5 * internal + 0.3 * xScore + 0.2 * yEqW))
  const warnings = [
    'Combinación doble (W-X-Y): estructura correctiva compleja; conteo más ambiguo que un ABC simple.',
  ]
  if (yMag / wMag > 1.78)
    warnings.push('La onda Y es bastante más larga que la W: revisa si no es un impulso disfrazado.')
  return { score, warnings }
}

function buildWxy(
  p: Pivot[],
  dir: Direction,
  scored: Scored,
  candles: Candle[],
  ind: Indicators,
): Scenario {
  const v = (i: number) => val(p[i], dir)
  const sign = dir === 'up' ? 1 : -1
  const developing = !p[7].confirmed
  const down = dir === 'down'
  const dirWord = down ? 'bajista' : 'alcista'
  const warnings = [...scored.warnings]
  if (developing) warnings.push('Onda Y sin confirmar: puede repintar al llegar nuevas velas.')

  // Superar el origen niega la corrección neta en dir.
  const invalidation = {
    price: p[0].price,
    reason: `Superar el origen de la corrección (${fmt(p[0].price)}) invalida la doble W-X-Y.`,
  }

  const wMag = v(3) - v(0)
  // Solo la versión EN DESARROLLO lleva zona objetivo direccional (la onda Y).
  // Completada: SIN target (como un ABC completado) → la reanudación apunta al
  // origen vía projectionTargets/computeRiskPlan, evitando una "zona" tautológica
  // que abarque toda la corrección (R:R inservible y avisos espurios).
  let target: PriceZone | undefined
  if (developing) {
    // Zona objetivo de la onda Y: entre 0.618×W e igualdad con W, medida desde el fin de X (P4).
    const a = p[4].price + sign * 0.618 * wMag
    const b = p[4].price + sign * wMag
    target = { label: 'Zona objetivo onda Y (≈W)', low: Math.max(Math.min(a, b), 0), high: Math.max(a, b) }
  }

  // Confluencia macro: W (P0→P3) como "onda A" y X (P3→P4) como "onda B" conectora.
  const factors = evaluateAbcConfluence(candles, ind, [p[0], p[3], p[4], p[7]], dir)
  const confluence: Confluence = {
    score: factors.filter((f) => f.met).length,
    max: factors.length,
    factors,
  }
  const { score, confidence } = blend(scored.score, confluence, developing)

  const narrative =
    `Posible combinación correctiva doble (W-X-Y) ${dirWord}: dos correcciones (W e Y) unidas por una ` +
    `onda X conectora. Estructura lateral/compleja, típica de ondas 4 o B prolongadas. Al completarse Y ` +
    `suele reanudarse la tendencia previa a la corrección; es un mapa de escenarios, no una señal.`

  return {
    id: `wxy-${dir}-${p[0].index}-${p[7].index}`,
    kind: 'correction',
    pattern: 'wxy',
    direction: dir,
    title: developing
      ? `Posible doble W-X-Y ${dirWord} — onda Y en desarrollo`
      : `Posible combinación correctiva doble (W-X-Y) ${dirWord}`,
    pivots: p,
    labels: labelsFor(p, ['a', 'b', 'W', 'X', 'a', 'b', 'Y']),
    score,
    confidence,
    confluence,
    developing,
    invalidation,
    target,
    narrative,
    warnings,
  }
}

/** Diagonal final (cuña con solapamiento 1-4): impulso terminal que anticipa reversión. */
function scoreDiagonal(p: Pivot[], dir: Direction): Scored | null {
  const v = (i: number) => val(p[i], dir)
  const w1 = v(1) - v(0)
  const w3 = v(3) - v(2)
  const w5 = v(5) - v(4)
  if (w1 <= 0 || w3 <= 0 || w5 <= 0) return null
  if (v(2) >= v(1) || v(4) >= v(3)) return null
  if (v(2) <= v(0)) return null // regla 1: onda 2 no rompe el origen
  if (v(3) <= v(1)) return null // onda 3 supera onda 1
  if (v(4) > v(1)) return null // DEBE haber solapamiento 1-4 (si no, es impulso)
  if (!(w3 < w1 && w5 < w3)) return null // cuña contractiva: cada onda motriz más corta

  const ret2 = (v(1) - v(2)) / w1
  const ret4 = (v(3) - v(4)) / w3
  const fib = (fibScore(ret2, [0.618, 0.786]) + fibScore(ret4, [0.618, 0.786])) / 2
  const score = Math.round(100 * (0.6 * fib + 0.4))
  return {
    score,
    warnings: ['Diagonal: cuña con solapamiento 1-4; suele preceder una reversión rápida y profunda.'],
  }
}

function buildDiagonal(
  p: Pivot[],
  dir: Direction,
  scored: Scored,
  candles: Candle[],
  ind: Indicators,
): Scenario {
  const v = (i: number) => val(p[i], dir)
  const sign = dir === 'up' ? 1 : -1
  const developing = !p[5].confirmed
  const up = dir === 'up'
  const dirWord = up ? 'alcista' : 'bajista'
  const range = v(5) - v(0)

  const warnings = [...scored.warnings]
  if (developing) warnings.push('Última onda sin confirmar: puede repintar al llegar nuevas velas.')

  const invalidation = {
    price: p[5].price,
    reason: `Superar el extremo de la onda 5 (${fmt(p[5].price)}) cuestiona el fin de la diagonal.`,
  }
  // Tras una diagonal final, reversión rápida hacia el inicio de la cuña.
  const a = p[5].price - sign * 0.618 * range
  const b = p[5].price - sign * range
  const target: PriceZone = {
    label: 'Zona de reversión esperada',
    low: Math.min(a, b),
    high: Math.max(a, b),
  }

  const narrative =
    `Posible diagonal final ${dirWord} (cuña 1-2-3-4-5 con solapamiento de la onda 4 sobre la 1). ` +
    `Aparece al final de un movimiento mayor y suele anticipar una reversión rápida que retrocede gran parte de la cuña. ` +
    `Vigila la ruptura de la directriz inferior/superior como confirmación.`

  // Diagonal: subdivide 3-3-3-3-3, así que el factor de subondas (que espera 5-3-5) no aplica.
  const factors = evaluateImpulseConfluence(candles, ind, p, dir, false)
  const confluence: Confluence = {
    score: factors.filter((f) => f.met).length,
    max: factors.length,
    factors,
  }
  const { score, confidence } = blend(scored.score, confluence, developing)

  return {
    id: `diagonal-${dir}-${p[0].index}-${p[5].index}`,
    kind: 'impulse',
    pattern: 'diagonal',
    direction: dir,
    title: developing
      ? `Posible diagonal final ${dirWord} — onda 5 en desarrollo`
      : `Posible diagonal final ${dirWord} — reversión probable`,
    pivots: p,
    labels: labelsFor(p, ['1', '2', '3', '4', '5']),
    score,
    confidence,
    confluence,
    developing,
    invalidation,
    target,
    narrative,
    warnings,
  }
}

/** Triángulo contractivo A-B-C-D-E (5 legs / 6 pivotes). Lateral, sin dirección fija. */
function scoreTriangle(p: Pivot[]): Scored | null {
  const leg = (i: number) => Math.abs(p[i + 1].price - p[i].price)
  const L = [leg(0), leg(1), leg(2), leg(3), leg(4)]
  if (L.some((x) => x <= 0)) return null
  // Contracción estricta: cada onda menor que la de su mismo sentido anterior.
  if (!(L[2] < L[0] && L[3] < L[1] && L[4] < L[2])) return null

  const r1 = L[2] / L[0]
  const r2 = L[3] / L[1]
  const r3 = L[4] / L[2]
  const fib =
    (fibScore(r1, [0.618, 0.786]) + fibScore(r2, [0.618, 0.786]) + fibScore(r3, [0.618, 0.786])) / 3
  const score = Math.round(100 * (0.6 * fib + 0.3))
  return { score, warnings: [] }
}

function buildTriangle(p: Pivot[], scored: Scored, candles: Candle[], ind: Indicators): Scenario {
  const developing = !p[5].confirmed
  const widest = Math.abs(p[1].price - p[0].price)
  const ePrice = p[5].price
  const warnings = [...scored.warnings]
  if (developing) warnings.push('Onda E sin confirmar: puede repintar al llegar nuevas velas.')

  const invalidation = {
    price: p[0].price,
    reason: `Una ruptura amplia más allá del inicio del triángulo (${fmt(p[0].price)}) rompe la estructura.`,
  }
  const target: PriceZone = {
    label: 'Objetivo tras ruptura (±amplitud)',
    // El thrust bajista no puede dar precios negativos (triángulos muy amplios en pares baratos).
    low: Math.max(ePrice - widest, 0),
    high: ePrice + widest,
  }
  const narrative =
    `Posible triángulo contractivo (A-B-C-D-E), típico de onda 4 o de onda B. ` +
    `Indica que la corrección está cerca de completarse; la ruptura de la directriz define la dirección, ` +
    `con un impulso (thrust) de magnitud parecida a la amplitud del triángulo. El volumen suele contraerse dentro.`

  const factors = evaluateTriangleConfluence(candles, ind, p)
  const confluence: Confluence = {
    score: factors.filter((f) => f.met).length,
    max: factors.length,
    factors,
  }
  const { score, confidence } = blend(scored.score, confluence, developing)

  return {
    id: `triangulo-${p[0].index}-${p[5].index}`,
    kind: 'correction',
    pattern: 'triangulo',
    direction: p[0].type === 'high' ? 'down' : 'up',
    title: developing ? 'Posible triángulo — onda E en desarrollo' : 'Posible triángulo (A-B-C-D-E)',
    pivots: p,
    labels: labelsFor(p, ['A', 'B', 'C', 'D', 'E']),
    score,
    confidence,
    confluence,
    developing,
    invalidation,
    target,
    narrative,
    warnings,
  }
}

/** Mejor escenario por tipo encontrado en un conjunto de pivotes (un grado). */
interface Candidates {
  impulse: Scenario | null
  diagonal: Scenario | null
  abc: Scenario | null
  triangle: Scenario | null
  wxy: Scenario | null
}

const keepBest = (cur: Scenario | null, sc: Scenario) => (!cur || sc.score > cur.score ? sc : cur)

/** Genera el mejor candidato de cada tipo a partir de los pivotes de un grado. */
function collectCandidates(pivots: Pivot[], candles: Candle[], ind: Indicators): Candidates {
  const directions: Direction[] = ['up', 'down']
  const out: Candidates = { impulse: null, diagonal: null, abc: null, triangle: null, wxy: null }

  // Motivas (impulso / diagonal): ventanas de 6 pivotes entre los últimos ~10.
  const recentI = pivots.slice(-10)
  for (let s = 0; s + 6 <= recentI.length; s++) {
    const w = recentI.slice(s, s + 6)
    const tri = scoreTriangle(w)
    if (tri) out.triangle = keepBest(out.triangle, buildTriangle(w, tri, candles, ind))
    for (const dir of directions) {
      const expectedFirst = dir === 'up' ? 'low' : 'high'
      if (w[0].type !== expectedFirst) continue
      const imp = scoreImpulse(w, dir)
      if (imp) out.impulse = keepBest(out.impulse, buildImpulse(w, dir, imp, candles, ind))
      const dia = scoreDiagonal(w, dir)
      if (dia) out.diagonal = keepBest(out.diagonal, buildDiagonal(w, dir, dia, candles, ind))
    }
  }

  // Correcciones ABC (zigzag/flat): ventanas de 4 pivotes entre los últimos ~8.
  const recentC = pivots.slice(-8)
  for (let s = 0; s + 4 <= recentC.length; s++) {
    const w = recentC.slice(s, s + 4)
    for (const dir of directions) {
      const expectedFirst = dir === 'up' ? 'low' : 'high'
      if (w[0].type !== expectedFirst) continue
      const abc = scoreAbc(w, dir)
      if (abc) out.abc = keepBest(out.abc, buildAbc(w, dir, abc, candles, ind))
    }
  }

  // Combinaciones correctivas dobles W-X-Y: ventanas de 8 pivotes entre los últimos ~12.
  const recentWxy = pivots.slice(-12)
  for (let s = 0; s + 8 <= recentWxy.length; s++) {
    const w = recentWxy.slice(s, s + 8)
    for (const dir of directions) {
      const expectedFirst = dir === 'up' ? 'low' : 'high'
      if (w[0].type !== expectedFirst) continue
      const wxy = scoreWxy(w, dir)
      if (wxy) out.wxy = keepBest(out.wxy, buildWxy(w, dir, wxy, candles, ind))
    }
  }
  return out
}

/** Selección con diversidad: mejor motriz + mejor correctiva, top-3 por score. */
function selectDiverse(c: Candidates): Scenario[] {
  const byScore = (a: Scenario, b: Scenario) => b.score - a.score
  const motive = [c.impulse, c.diagonal].filter((x): x is Scenario => x !== null).sort(byScore)
  const corrective = [c.abc, c.triangle, c.wxy].filter((x): x is Scenario => x !== null).sort(byScore)
  const picked: Scenario[] = []
  if (motive[0]) picked.push(motive[0])
  if (corrective[0]) picked.push(corrective[0])
  const rest = [...motive.slice(1), ...corrective.slice(1)].sort(byScore)
  for (const s of rest) {
    if (picked.length >= 3) break
    picked.push(s)
  }
  return picked.map(applyPivotQuality).sort(byScore)
}

/**
 * Detecta los mejores escenarios de Elliott sobre las velas dadas (un solo grado).
 * Devuelve hasta 3 escenarios ranqueados (primario + alternativos), nunca "el" conteo.
 */
export function detectScenarios(candles: Candle[], k = 3): { pivots: Pivot[]; scenarios: Scenario[] } {
  const pivots = zigzag(candles, k)
  if (pivots.length < 4) return { pivots, scenarios: [] }
  const ind = computeIndicators(candles)
  return { pivots, scenarios: selectDiverse(collectCandidates(pivots, candles, ind)) }
}

/**
 * Detección MULTI-GRADO: corre el ZigZag con varias sensibilidades y se queda con
 * el mejor candidato de cada tipo ENTRE TODOS los grados, reduciendo la dependencia
 * de un único `k` arbitrario. Los indicadores se calculan una sola vez (no dependen
 * de k). Devuelve los pivotes del grado base (para referencia).
 */
export function detectScenariosMultiDegree(
  candles: Candle[],
  kList: number[],
): { pivots: Pivot[]; scenarios: Scenario[] } {
  if (kList.length === 0) return { pivots: [], scenarios: [] }
  const ind = computeIndicators(candles)
  const basePivots = zigzag(candles, kList[Math.floor(kList.length / 2)])

  const merged: Candidates = { impulse: null, diagonal: null, abc: null, triangle: null, wxy: null }
  for (const k of kList) {
    // Williams limpia micro-pivotes del grado fino antes de buscar conteos.
    const pivots = williamsFilter(zigzag(candles, k), candles)
    if (pivots.length < 4) continue
    const c = collectCandidates(pivots, candles, ind)
    merged.impulse = pickBetter(merged.impulse, c.impulse)
    merged.diagonal = pickBetter(merged.diagonal, c.diagonal)
    merged.abc = pickBetter(merged.abc, c.abc)
    merged.triangle = pickBetter(merged.triangle, c.triangle)
    merged.wxy = pickBetter(merged.wxy, c.wxy)
  }
  return { pivots: basePivots, scenarios: selectDiverse(merged) }
}

const pickBetter = (a: Scenario | null, b: Scenario | null): Scenario | null => {
  if (!a) return b
  if (!b) return a
  return b.score > a.score ? b : a
}

/**
 * Penaliza (no descarta) un escenario que se apoya en pivotes de baja fiabilidad
 * (mecha desproporcionada / baja liquidez) y lo avisa. Coherente con la filosofía
 * probabilística: ponderar la evidencia, no fingir certeza.
 */
function applyPivotQuality(s: Scenario): Scenario {
  const flags = new Set(s.pivots.map((p) => p.flag).filter(Boolean))
  if (flags.size === 0) return s
  const warnings = [...s.warnings]
  if (flags.has('wick_spike'))
    warnings.push(
      'Algún pivote se formó en una mecha desproporcionada (flash-crash/barrido de stops): conteo menos fiable.',
    )
  if (flags.has('low_liquidity'))
    warnings.push('Algún pivote se formó con volumen muy bajo (baja liquidez): conteo menos fiable.')
  const score = Math.round(s.score * 0.9)
  return { ...s, score, confidence: confidenceOf(score), warnings }
}
