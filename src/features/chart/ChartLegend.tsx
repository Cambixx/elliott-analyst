import type { Scenario } from '@/domain/elliott/types'

/** Colores de las ondas por patrón (coinciden con WAVE_COLOR de CandleChart). */
const PATTERN_COLOR: Record<Scenario['pattern'], string> = {
  impulso: '#22d3ee',
  diagonal: '#2dd4bf',
  zigzag: '#f59e0b',
  flat: '#fb923c',
  triangulo: '#a78bfa',
  wxy: '#fbbf24',
}
const PATTERN_LABEL: Record<Scenario['pattern'], string> = {
  impulso: 'Impulso',
  diagonal: 'Diagonal',
  zigzag: 'Zigzag',
  flat: 'Plana',
  triangulo: 'Triángulo',
  wxy: 'Doble W-X-Y',
}

function Item({
  color,
  label,
  dashed,
  triangle,
}: {
  color: string
  label: string
  dashed?: boolean
  /** Si se indica, dibuja un triángulo (marcador de pivote) en vez de una línea. */
  triangle?: 'up' | 'down'
}) {
  return (
    <span className="flex items-center gap-1 whitespace-nowrap text-[10px] text-slate-400">
      {triangle ? (
        <span
          className="inline-block h-0 w-0 shrink-0"
          style={
            triangle === 'up'
              ? { borderLeft: '4px solid transparent', borderRight: '4px solid transparent', borderBottom: `6px solid ${color}` }
              : { borderLeft: '4px solid transparent', borderRight: '4px solid transparent', borderTop: `6px solid ${color}` }
          }
        />
      ) : (
        <span
          className="inline-block h-0 w-3.5 shrink-0"
          style={{ borderTop: `2px ${dashed ? 'dashed' : 'solid'} ${color}` }}
        />
      )}
      {label}
    </span>
  )
}

/**
 * Leyenda compacta de lo que hay AHORA en el gráfico: el conteo primario (con su color),
 * las EMAs de contexto y las capas activas. Se actualiza con los toggles, así el usuario
 * nunca tiene que adivinar qué es cada color.
 */
export function ChartLegend({
  primary,
  alternativesOn,
  fib,
  levelsOn,
  pivotsOn,
  forecastOn,
}: {
  primary: Scenario | null | undefined
  alternativesOn: boolean
  fib: boolean
  levelsOn: boolean
  pivotsOn: boolean
  forecastOn: boolean
}) {
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-slate-800 bg-slate-900/40 px-3 py-1">
      {primary && (
        <Item
          color={PATTERN_COLOR[primary.pattern]}
          label={`Conteo primario · ${PATTERN_LABEL[primary.pattern]}`}
        />
      )}
      {alternativesOn && <Item color="#64748b" label="Alternativos (atenuados)" />}
      <Item color="#cbd5e1" label="EMA 50/200" />
      {fib && <Item color="#eab308" label="Fibonacci" />}
      {levelsOn && (
        <>
          <Item color="#22c55e" label="Soporte" />
          <Item color="#ef4444" label="Resistencia" />
          <Item color="#c084fc" label="VWAP" dashed />
          <Item color="#818cf8" label="Convergencia" />
        </>
      )}
      {pivotsOn && (
        <>
          <Item color="#ef4444" label="Pivote máx." triangle="down" />
          <Item color="#22c55e" label="Pivote mín." triangle="up" />
          <Item color="#94a3b8" label="Niveles de pivote" />
        </>
      )}
      {forecastOn && <Item color="#f472b6" label="Proyección" dashed />}
    </div>
  )
}
