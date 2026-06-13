/**
 * Formatea un precio de forma adaptativa: 2 decimales para precios ≥ 1, y cifras
 * significativas para monedas baratas (SHIB, PEPE, BONK… ~0.0000X) que con decimales
 * fijos se mostrarían como "0".
 */
export function formatPrice(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return '—'
  const abs = Math.abs(n)
  if (abs >= 1) return n.toLocaleString('es-ES', { maximumFractionDigits: 2 })
  if (abs === 0) return '0'
  return n.toLocaleString('es-ES', { maximumSignificantDigits: 4 })
}
