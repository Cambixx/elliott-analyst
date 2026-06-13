/** Media móvil exponencial. Devuelve un array alineado al input (NaN en el warmup). */
export function ema(values: number[], period: number): number[] {
  const out = new Array<number>(values.length).fill(NaN)
  if (values.length < period) return out

  const mult = 2 / (period + 1)
  let sum = 0
  for (let i = 0; i < period; i++) sum += values[i]
  let prev = sum / period
  out[period - 1] = prev

  for (let i = period; i < values.length; i++) {
    prev = (values[i] - prev) * mult + prev
    out[i] = prev
  }
  return out
}
