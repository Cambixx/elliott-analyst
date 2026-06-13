import { useMemo } from 'react'
import type { Candle } from '@/types/market'
import { detectScenariosMultiDegree } from '@/domain/elliott/detector'
import { degreeList } from '@/domain/elliott/backtest'

/**
 * Ejecuta el detector de Elliott sobre las velas CERRADAS del histórico.
 * Memoizado: sólo recalcula cuando cambian las velas o la sensibilidad.
 *
 * Anti-repaint en vivo: se descarta cualquier vela aún en formación (closed:false,
 * típicamente la última). Sin este filtro, su high/low cambiante fijaría un pivote
 * firme del ZigZag que repintaría en cada tick. El pivote provisional del propio
 * ZigZag (última onda "sin confirmar") sigue existiendo; esto solo evita que una
 * vela no cerrada haga de extremo.
 *
 * Nota: el cálculo es ligero (<10ms para 1000 velas). Si en el futuro se
 * encadenan más grados/patrones, mover detectScenarios a un Web Worker es
 * un cambio aislado a este hook.
 */
export function useElliott(candles: Candle[] | undefined, sensitivity: number) {
  return useMemo(() => {
    if (!candles) return { pivots: [], scenarios: [] }
    const closed = candles.filter((c) => c.closed)
    if (closed.length < 20) return { pivots: [], scenarios: [] }
    // Multi-grado: además del grado seleccionado, se prueban uno más fino y otro
    // más grueso, quedándose con el mejor conteo de cada tipo entre los tres.
    // Reduce la dependencia de un único `k` arbitrario. `degreeList` es la misma
    // fuente que usa el backtest, para que calibración y UI midan lo mismo.
    return detectScenariosMultiDegree(closed, degreeList(sensitivity))
  }, [candles, sensitivity])
}
