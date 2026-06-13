import type { DataQuality } from './useDataQuality'

function ageLabel(ms: number): string {
  const min = Math.round(ms / 60_000)
  if (min < 1) return 'ahora'
  if (min < 60) return `hace ${min} min`
  const h = Math.round(min / 60)
  if (h < 24) return `hace ${h} h`
  return `hace ${Math.round(h / 24)} d`
}

/**
 * Badge compacto de calidad del dato: frescura de la última vela cerrada +
 * aviso si hay huecos/duplicados. No es decorativo: comunica honestamente sobre
 * qué calidad de dato se ha calculado el conteo (filosofía de no-oráculo).
 */
export function DataQualityBadge({ quality }: { quality: DataQuality }) {
  const { freshness, lastClosedAgeMs, integrity } = quality
  if (freshness === 'unknown') return null

  const broken = !integrity.ok
  const missing = integrity.gaps + integrity.duplicates + integrity.outOfOrder

  const tone =
    broken || freshness === 'stale'
      ? 'border-red-500/30 bg-red-500/10 text-red-300'
      : freshness === 'lagging'
        ? 'border-amber-500/30 bg-amber-500/10 text-amber-300'
        : 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300'

  const dot =
    broken || freshness === 'stale'
      ? 'bg-red-400'
      : freshness === 'lagging'
        ? 'bg-amber-400'
        : 'bg-emerald-400'

  const freshText =
    freshness === 'fresh'
      ? 'datos al día'
      : freshness === 'lagging'
        ? 'datos con retraso'
        : 'datos parados'

  const title = [
    `Última vela cerrada: ${lastClosedAgeMs != null ? ageLabel(lastClosedAgeMs) : '—'}.`,
    broken
      ? `Integridad: faltan/incoherentes ${missing} velas (huecos ${integrity.gaps}, duplicados ${integrity.duplicates}, desorden ${integrity.outOfOrder}). El conteo puede ser menos fiable.`
      : 'Integridad temporal correcta (sin huecos).',
    'El análisis se calcula solo sobre velas cerradas.',
  ].join(' ')

  return (
    <span
      title={title}
      className={'flex items-center gap-1.5 rounded border px-1.5 py-0.5 text-[10px] font-medium ' + tone}
    >
      <span className={'h-1.5 w-1.5 rounded-full ' + dot} aria-hidden="true" />
      {broken ? `faltan ${missing} velas` : freshText}
    </span>
  )
}
