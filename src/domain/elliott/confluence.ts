import type { Candle } from '@/types/market'
import type { Indicators } from '@/domain/indicators'
import { obvNotConfirming } from '@/domain/indicators/obv'
import type { ConfluenceFactor, Direction, Pivot } from './types'
import { fibScore, FIB_IDEALS } from './fibonacci'
import { impulseChannelContainment } from './channel'
import { computeATR } from './atr'
import { zigzag, williamsFilter } from './zigzag'
import { vsaTurnConfirms } from './vsa'

const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x))

function median(xs: number[]): number {
  const v = xs.filter(Number.isFinite).sort((a, b) => a - b)
  if (v.length === 0) return 0
  const mid = Math.floor(v.length / 2)
  return v.length % 2 ? v[mid] : (v[mid - 1] + v[mid]) / 2
}

/**
 * Cuenta los sub-swings (legs) dentro del sub-rango [fromIdx..toIdx] de velas,
 * usando un ZigZag con un `k` DERIVADO de la amplitud de la propia onda (no de un
 * k global, que no se conoce porque el escenario pudo venir de cualquier grado).
 * `expectedLegs` calibra el umbral para resolver ~ese nº de swings sin trocear ruido.
 * Exportado para pruebas unitarias.
 */
export function countSubSwings(
  candles: Candle[],
  fromIdx: number,
  toIdx: number,
  amp: number,
  expectedLegs: number,
): { legs: number; enoughData: boolean } {
  const span = toIdx - fromIdx
  if (span < expectedLegs * 2) return { legs: 0, enoughData: false } // ~2 velas por leg mínimo
  const sub = candles.slice(fromIdx, toIdx + 1)
  const atr = computeATR(sub, clamp(Math.floor(span / 2), 2, 14))
  const medAtr = median(atr)
  if (!(medAtr > 0) || !(amp > 0)) return { legs: 0, enoughData: false }
  const kFine = clamp(amp / (expectedLegs * 1.6) / medAtr, 0.4, 3)
  const piv = williamsFilter(zigzag(sub, kFine), sub, 1)
  return { legs: Math.max(0, piv.length - 1), enoughData: true }
}

const ok = (v: number) => Number.isFinite(v)

/** Porcentaje de confluencia PONDERADO (el mismo que usa el score interno). */
export function weightedMetPct(factors: ConfluenceFactor[]): number {
  let wMet = 0
  let wTotal = 0
  for (const f of factors) {
    const w = f.weight ?? 1
    wTotal += w
    if (f.met) wMet += w
  }
  return wTotal ? Math.round((wMet / wTotal) * 100) : 0
}
const range = (a: number, b: number): [number, number] => [Math.min(a, b), Math.max(a, b)]

function avgVolume(candles: Candle[], a: number, b: number): number {
  const [lo, hi] = range(a, b)
  let sum = 0
  let n = 0
  for (let i = lo; i <= hi; i++) {
    sum += candles[i].volume
    n++
  }
  return n ? sum / n : 0
}

/**
 * Evalúa los 8 factores de confluencia de un impulso 1-2-3-4-5 contra los
 * indicadores (RSI, MACD, volumen, EMAs). Cada factor confirma o refuta el conteo.
 */
export function evaluateImpulseConfluence(
  candles: Candle[],
  ind: Indicators,
  p: Pivot[],
  dir: Direction,
  /** false para diagonales (subdividen 3-3-3-3-3, no 5-3-5): el factor de subondas no aplica. */
  expectMotiveSubdivision = true,
): ConfluenceFactor[] {
  const up = dir === 'up'
  const s = up ? 1 : -1
  const V = (i: number) => s * p[i].price
  const idx = (i: number) => p[i].index
  const factors: ConfluenceFactor[] = []

  const [lo, hi] = range(idx(0), idx(5))
  const [w3a, w3b] = range(idx(2), idx(3))

  // 1. Estructura válida (el detector ya filtró las 3 reglas cardinales).
  // Tautológico (siempre true tras el filtro) → peso bajo: no debe inflar el score.
  factors.push({
    key: 'estructura',
    label: 'Estructura de impulso válida (3 reglas cardinales)',
    met: true,
    weight: 0.3,
  })

  // 2. Pico de momentum (MACD) en la onda 3.
  let maxHist = -Infinity
  let maxHistIdx = -1
  for (let i = lo; i <= hi; i++) {
    const h = Math.abs(ind.macd.hist[i])
    if (ok(h) && h > maxHist) {
      maxHist = h
      maxHistIdx = i
    }
  }
  const momInW3 = maxHistIdx >= w3a && maxHistIdx <= w3b
  factors.push({
    key: 'macd3',
    label: 'Pico de momentum (MACD) en la onda 3',
    met: momInW3,
    weight: 1.5, // muy informativo: la onda 3 es la de mayor momentum
    detail: momInW3 ? undefined : 'El mayor histograma MACD no cae en la onda 3.',
  })

  // 3. Divergencia de RSI en la onda 5, CORROBORADA por volumen (OBV). La divergencia
  // de precio/RSI es condición NECESARIA; el OBV solo puede DEBILITARLA (AND): si el
  // volumen acumulado acompaña al nuevo extremo, no hay agotamiento real. Por construcción
  // el factor dispara MENOS o IGUAL que antes (nunca más) → no infla la distribución del
  // score; solo elimina divergencias-RSI puras que el volumen contradice.
  const r3 = ind.rsi[idx(3)]
  const r5 = ind.rsi[idx(5)]
  let priceRsiDiv = false
  if (ok(r3) && ok(r5)) {
    priceRsiDiv = up ? p[5].price > p[3].price && r5 < r3 : p[5].price < p[3].price && r5 > r3
  }
  const obvDiverges = obvNotConfirming(ind.obv, idx(3), idx(5), dir)
  factors.push({
    key: 'div5',
    label: 'Divergencia de RSI en la onda 5 (corroborada por volumen)',
    met: priceRsiDiv && obvDiverges,
    weight: 1.5, // señal clásica de agotamiento del impulso, muy informativa
    detail:
      ok(r3) && ok(r5)
        ? `RSI onda 3 ${r3.toFixed(0)} → onda 5 ${r5.toFixed(0)}; OBV ${obvDiverges ? 'no acompaña la extensión (corrobora)' : 'acompaña el precio (divergencia débil)'}`
        : undefined,
  })

  // 4. RSI coherente durante la onda 3 (>40 en alcista, <60 en bajista).
  let any = false
  let rsiOk = true
  for (let i = w3a; i <= w3b; i++) {
    const r = ind.rsi[i]
    if (ok(r)) {
      any = true
      if (up ? r < 40 : r > 60) rsiOk = false
    }
  }
  factors.push({
    key: 'rsi3',
    label: up ? 'RSI se mantiene > 40 en la onda 3' : 'RSI se mantiene < 60 en la onda 3',
    met: any && rsiOk,
  })

  // 5. Retrocesos de Fibonacci válidos en ondas 2 y 4.
  const w1 = V(1) - V(0)
  const w3 = V(3) - V(2)
  const ret2 = (V(1) - V(2)) / w1
  const ret4 = (V(3) - V(4)) / w3
  const fib24 =
    fibScore(ret2, FIB_IDEALS.wave2Retrace) > 0.5 && fibScore(ret4, FIB_IDEALS.wave4Retrace) > 0.5
  factors.push({ key: 'fib24', label: 'Retrocesos de Fibonacci válidos (ondas 2 y 4)', met: fib24 })

  // 6. Objetivo de extensión de Fibonacci (onda 3 o 5).
  const ext3 = w3 / w1
  const ext5 = (V(5) - V(4)) / w1
  const fibExt =
    fibScore(ext3, FIB_IDEALS.wave3Extension) > 0.5 || fibScore(ext5, FIB_IDEALS.wave5) > 0.5
  factors.push({ key: 'fibExt', label: 'Extensión de Fibonacci cumplida (onda 3 o 5)', met: fibExt })

  // 7. VSA en el giro (fin de onda 5): clímax/absorción/distribución que confirma el
  // agotamiento — esfuerzo (volumen en percentil alto) con rechazo del extremo (CLV).
  // Reemplaza la antigua heurística de volumen por medias/máximos, pobre y sensible a
  // outliers. El tipo del pivote (high/low) decide la simetría; wick_spike → met=false.
  const vsa5 = vsaTurnConfirms(candles, p[5])
  factors.push({
    key: 'vol',
    label: 'Clímax/absorción VSA en el giro (fin de onda 5)',
    met: vsa5.met,
    weight: 1.2,
    detail: vsa5.detail,
  })

  // 8. EMAs alineadas con la dirección del impulso (al final del conteo).
  const li = idx(5)
  const e20 = ind.ema20[li]
  const e50 = ind.ema50[li]
  const e200 = ind.ema200[li]
  let emaOk = false
  if (ok(e20) && ok(e50) && ok(e200)) {
    emaOk = up ? e20 > e50 && e50 > e200 : e20 < e50 && e50 < e200
  }
  factors.push({ key: 'ema', label: 'EMAs (20/50/200) alineadas con la tendencia', met: emaOk })

  // 9. Contención en el canal de Elliott (0-2 / 1-3): un impulso sano queda
  // razonablemente dentro de su canal (salvo throw-overs puntuales en 3 y 5).
  const channel = impulseChannelContainment(candles, p, dir)
  factors.push({
    key: 'canal',
    label: 'Precio contenido en el canal de Elliott (0-2 / 1-3)',
    met: channel.contained,
    weight: 1.2,
    detail: channel.bars
      ? `${channel.breaches}/${channel.bars} cierres rompen el canal`
      : undefined,
  })

  // 10. Subondas coherentes con el grado (fractalidad): la onda 3 (motriz) debe
  // subdividir en AL MENOS tantas sub-ondas como sus correcciones adyacentes (2 y 4),
  // a un grado más fino. Criterio RELATIVO (no "≥5 exacto"): una onda 3 limpia y
  // potente con pocos retrocesos sigue siendo válida y no debe penalizarse — la
  // señal de incoherencia es que la motriz subdivida MENOS que sus correcciones.
  // Solo para impulsos reales (las diagonales subdividen 3-3-3-3-3).
  // Si faltan datos (TF alto / pocas velas) el factor se OMITE (ni suma ni resta).
  if (expectMotiveSubdivision) {
    const ampOf = (i: number) => Math.abs(p[i + 1].price - p[i].price)
    const w2 = countSubSwings(candles, idx(1), idx(2), ampOf(1), 3)
    const w3 = countSubSwings(candles, idx(2), idx(3), ampOf(2), 5)
    const w4 = countSubSwings(candles, idx(3), idx(4), ampOf(3), 3)
    if (w2.enoughData && w3.enoughData && w4.enoughData) {
      const motiveSubdividesMore = w3.legs >= 3 && w3.legs >= w2.legs && w3.legs >= w4.legs
      const correctionsBounded = w2.legs <= 4 && w4.legs <= 4 // no parecen impulsos de 5
      factors.push({
        key: 'subondas',
        label: 'Subondas coherentes con el grado (la 3 subdivide más que la 2 y la 4)',
        met: motiveSubdividesMore && correctionsBounded,
        weight: 1,
        detail: `Sub-swings 2/3/4 = ${w2.legs}/${w3.legs}/${w4.legs}`,
      })
    }
  }

  return factors
}

/** Confluencia para triángulos (consolidación: volumen contrae, RSI neutral). */
export function evaluateTriangleConfluence(
  candles: Candle[],
  ind: Indicators,
  p: Pivot[],
): ConfluenceFactor[] {
  const idx = (i: number) => p[i].index
  const factors: ConfluenceFactor[] = []

  factors.push({ key: 'estructura', label: 'Estructura de triángulo (A-B-C-D-E contractiva)', met: true, weight: 0.3 })

  // Volumen contrae a lo largo del triángulo (segunda mitad < primera mitad).
  const mid = idx(Math.floor(p.length / 2))
  const volFirst = avgVolume(candles, idx(0), mid)
  const volSecond = avgVolume(candles, mid, idx(p.length - 1))
  factors.push({
    key: 'volContrae',
    label: 'El volumen se contrae dentro del triángulo',
    met: volSecond < volFirst,
  })

  // RSI neutral al final de E (consolidación, sin extremo).
  const rE = ind.rsi[idx(p.length - 1)]
  const neutral = ok(rE) && rE > 40 && rE < 60
  factors.push({
    key: 'rsiNeutral',
    label: 'RSI neutral (40–60) al final del triángulo',
    met: neutral,
    detail: ok(rE) ? `RSI ${rE.toFixed(0)}` : undefined,
  })

  return factors
}

/** Confluencia reducida para correcciones ABC. */
export function evaluateAbcConfluence(
  candles: Candle[],
  ind: Indicators,
  p: Pivot[],
  dir: Direction,
): ConfluenceFactor[] {
  const down = dir === 'down'
  const idx = (i: number) => p[i].index
  const factors: ConfluenceFactor[] = []

  factors.push({ key: 'estructura', label: 'Estructura ABC coherente (A-B-C)', met: true, weight: 0.3 })

  // VSA en el giro (fin de onda C = p[3]): clímax/absorción que confirma el fin de la
  // corrección y la reanudación de la tendencia. Reemplaza la heurística "volumen de B <
  // volumen de A". El tipo del pivote p[3] (high/low) decide la simetría techo/suelo.
  const vsaC = vsaTurnConfirms(candles, p[3])
  factors.push({ key: 'volB', label: 'Clímax/absorción VSA al final de C', met: vsaC.met, detail: vsaC.detail })

  // RSI no extremo en el final de C (queda margen para reanudar la tendencia).
  const rC = ind.rsi[idx(3)]
  const rsiOk = ok(rC) && (down ? rC < 45 : rC > 55)
  factors.push({
    key: 'rsiC',
    label: down ? 'RSI deprimido al final de C (<45)' : 'RSI elevado al final de C (>55)',
    met: rsiOk,
    detail: ok(rC) ? `RSI ${rC.toFixed(0)}` : undefined,
  })

  // EMAs: la tendencia mayor sigue siendo contraria a la corrección.
  const li = idx(3)
  const e50 = ind.ema50[li]
  const e200 = ind.ema200[li]
  const trendIntact = ok(e50) && ok(e200) && (down ? e50 > e200 : e50 < e200)
  factors.push({ key: 'ema', label: 'Tendencia mayor (EMA50/200) intacta', met: trendIntact })

  return factors
}
