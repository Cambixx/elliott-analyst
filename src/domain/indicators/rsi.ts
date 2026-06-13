/** RSI de Wilder (period=14 por defecto). Array alineado al input (NaN en el warmup). */
export function rsi(closes: number[], period = 14): number[] {
  const n = closes.length
  const out = new Array<number>(n).fill(NaN)
  if (n <= period) return out

  let gain = 0
  let loss = 0
  for (let i = 1; i <= period; i++) {
    const ch = closes[i] - closes[i - 1]
    if (ch >= 0) gain += ch
    else loss -= ch
  }
  let avgGain = gain / period
  let avgLoss = loss / period
  // Sin pérdidas: 100, salvo precio totalmente plano (sin ganancias tampoco) → neutro 50.
  out[period] = avgLoss === 0 ? (avgGain === 0 ? 50 : 100) : 100 - 100 / (1 + avgGain / avgLoss)

  for (let i = period + 1; i < n; i++) {
    const ch = closes[i] - closes[i - 1]
    const g = ch >= 0 ? ch : 0
    const l = ch < 0 ? -ch : 0
    avgGain = (avgGain * (period - 1) + g) / period
    avgLoss = (avgLoss * (period - 1) + l) / period
    out[i] = avgLoss === 0 ? (avgGain === 0 ? 50 : 100) : 100 - 100 / (1 + avgGain / avgLoss)
  }
  return out
}
