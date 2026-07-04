import type { Candle } from '@/types/market'
import { computeATR } from '@/domain/elliott/atr'
import { percentileRank } from '@/domain/elliott/vsa'

// --- Parámetros CONGELADOS (freeParamCount efectivo = 1: ATR_LOOKBACK) ---------------
/** Periodo de Wilder para ADX. Canónico y de la familia 14 del motor (RSI/ATR). */
const ADX_PERIOD = 14
/** ADX ≥ 25 = tendencia fuerte; < 20 = rango (umbrales canónicos de Wilder). El hueco
 *  20–25 es "transición" (no forzar una etiqueta binaria). */
const ADX_TREND = 25
const ADX_RANGE = 20
/** Ventana del percentil de volatilidad. ÚNICO parámetro nuevo: abarca un ciclo de
 *  régimen de volatilidad sin cruzar de época (distinto del LOOKBACK=20 local de VSA). */
const ATR_LOOKBACK = 150
/** Percentiles de ATR para compresión/expansión (espejo de VOL_HI=0.8 de vsa.ts). */
const ATR_HI = 0.8
const ATR_LO = 0.2
/** Mínimo de muestras finitas para dar un percentil de ATR (~5 por quintil). */
const ATR_PCT_WARMUP = 30

export type RegimeTrend = 'tendencia-fuerte' | 'rango' | 'transicion'
export type RegimeVol = 'compresion' | 'expansion' | 'normal'

export interface RegimeContext {
  adx: number
  atrPct: number
  trend: RegimeTrend
  vol: RegimeVol
  /** Etiqueta humana ("Tendencia fuerte · compresión"). */
  label: string
  /** Detalle mono ("ADX 31 · ATR p88"). */
  detail: string
}

/**
 * ADX de Wilder (fuerza de tendencia, sin dirección), causal y alineado por índice:
 * warmup NaN hasta i = 2·period−1 (=27). Cada ADX[i] depende solo de velas ≤ i.
 */
export function computeADX(candles: Candle[], period = ADX_PERIOD): number[] {
  const n = candles.length
  const out = new Array<number>(n).fill(NaN)
  if (n < 2 * period) return out

  const tr = new Array<number>(n).fill(0)
  const plusDM = new Array<number>(n).fill(0)
  const minusDM = new Array<number>(n).fill(0)
  for (let i = 1; i < n; i++) {
    const h = candles[i].high
    const l = candles[i].low
    const cPrev = candles[i - 1].close
    tr[i] = Math.max(h - l, Math.abs(h - cPrev), Math.abs(l - cPrev))
    const upMove = h - candles[i - 1].high
    const downMove = candles[i - 1].low - l
    plusDM[i] = upMove > downMove && upMove > 0 ? upMove : 0
    minusDM[i] = downMove > upMove && downMove > 0 ? downMove : 0
  }

  // Suavizado de Wilder de TR / +DM / −DM.
  let sTR = 0
  let sPlus = 0
  let sMinus = 0
  for (let i = 1; i <= period; i++) {
    sTR += tr[i]
    sPlus += plusDM[i]
    sMinus += minusDM[i]
  }
  const dx = new Array<number>(n).fill(NaN)
  const computeDX = (i: number) => {
    const plusDI = sTR > 0 ? (100 * sPlus) / sTR : 0
    const minusDI = sTR > 0 ? (100 * sMinus) / sTR : 0
    const sum = plusDI + minusDI
    dx[i] = sum > 0 ? (100 * Math.abs(plusDI - minusDI)) / sum : 0
  }
  computeDX(period)
  for (let i = period + 1; i < n; i++) {
    sTR = sTR - sTR / period + tr[i]
    sPlus = sPlus - sPlus / period + plusDM[i]
    sMinus = sMinus - sMinus / period + minusDM[i]
    computeDX(i)
  }

  // ADX = media de los primeros `period` DX, luego suavizado de Wilder.
  const firstAdxIdx = 2 * period - 1
  if (firstAdxIdx >= n) return out
  let adx = 0
  for (let i = period; i <= firstAdxIdx; i++) adx += dx[i]
  adx /= period
  out[firstAdxIdx] = adx
  for (let i = firstAdxIdx + 1; i < n; i++) {
    adx = (adx * (period - 1) + dx[i]) / period
    out[i] = adx
  }
  return out
}

/**
 * Percentil causal del ATR RELATIVO (atr/close, sin deriva del nivel de precio) sobre las
 * `lookback` velas ANTERIORES (excluye la actual → sin look-ahead). NaN hasta tener
 * `ATR_PCT_WARMUP` muestras finitas. Reutiliza percentileRank (rank robusto) de vsa.ts.
 */
export function atrPercentile(candles: Candle[], lookback = ATR_LOOKBACK): number[] {
  const atr = computeATR(candles, ADX_PERIOD)
  const rel = candles.map((c, i) => (c.close > 0 ? atr[i] / c.close : NaN))
  return rel.map((v, i) => {
    if (!Number.isFinite(v)) return NaN
    const window = rel.slice(Math.max(0, i - lookback), i) // estrictamente anteriores
    if (window.filter(Number.isFinite).length < ATR_PCT_WARMUP) return NaN
    return percentileRank(window, v)
  })
}

/** Clasifica el régimen (fuerza de tendencia + volatilidad) a partir de ADX y percentil ATR. */
export function classifyRegime(adx: number, atrPct: number): RegimeContext {
  const finite = Number.isFinite(adx) && Number.isFinite(atrPct)
  const trend: RegimeTrend = adx >= ADX_TREND ? 'tendencia-fuerte' : adx < ADX_RANGE ? 'rango' : 'transicion'
  const vol: RegimeVol = atrPct < ATR_LO ? 'compresion' : atrPct > ATR_HI ? 'expansion' : 'normal'
  const trendLabel = trend === 'tendencia-fuerte' ? 'Tendencia fuerte' : trend === 'rango' ? 'Rango' : 'Transición'
  const volLabel = vol === 'compresion' ? ' · compresión' : vol === 'expansion' ? ' · expansión' : ''
  return {
    adx,
    atrPct,
    trend,
    vol,
    label: trendLabel + volLabel,
    detail: finite ? `ADX ${adx.toFixed(0)} · ATR p${Math.round(atrPct * 100)}` : 'datos de régimen insuficientes',
  }
}

/** Régimen de la ÚLTIMA vela cerrada (contexto global); null si aún no hay datos. */
export function computeRegime(candles: Candle[]): RegimeContext | null {
  if (candles.length === 0) return null
  const adx = computeADX(candles).at(-1)
  const atrPct = atrPercentile(candles).at(-1)
  if (adx == null || atrPct == null || !Number.isFinite(adx) || !Number.isFinite(atrPct)) return null
  return classifyRegime(adx, atrPct)
}

/**
 * Predicado del FACTOR de confluencia (solo se usa en correcciones ABC): un régimen de
 * baja tendencia (ADX < 20) o de compresión de volatilidad (ATR en percentil bajo) es
 * coherente con una corrección. Factor SUAVE (weight 0.3 en el llamador). Si faltan datos
 * (warmup), met=false y el llamador ya omite/no lo cuenta como discriminante.
 */
export function regimeFactor(adx: number, atrPct: number): { met: boolean; detail: string; readable: boolean } {
  const finite = Number.isFinite(adx) && Number.isFinite(atrPct)
  return {
    // readable=false durante el warmup (ADX/ATR NaN): el llamador OMITE el factor (como VSA),
    // en vez de contarlo como no cumplido → "ausencia de dato ≠ no cumplido".
    readable: finite,
    met: finite && (adx < ADX_RANGE || atrPct < ATR_LO),
    detail: finite ? `ADX ${adx.toFixed(0)} · ATR p${Math.round(atrPct * 100)}` : 'datos de régimen insuficientes',
  }
}
