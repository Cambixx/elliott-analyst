import { useMarketStore } from '@/store/useMarketStore'
import { formatPrice as fmtPrice } from '@/lib/format'
import { useFavoriteTickers } from './useFavoriteTickers'

/** Barra horizontal de pares favoritos: símbolo + precio + cambio 24h, clic para seleccionar. */
export function FavoritesBar() {
  const { symbol, favorites, setSymbol } = useMarketStore()
  const { data } = useFavoriteTickers(favorites)

  if (favorites.length === 0) return null

  return (
    <div className="flex gap-2 overflow-x-auto border-b border-slate-800 px-3 py-2">
      {favorites.map((s) => {
        const t = data?.[s]
        const active = s === symbol
        const base = s.replace(/USDC$/, '')
        const up = (t?.changePct ?? 0) >= 0
        return (
          <button
            key={s}
            onClick={() => setSymbol(s)}
            className={
              'flex min-w-[92px] shrink-0 flex-col rounded-md border px-2.5 py-1.5 text-left transition-colors ' +
              (active
                ? 'border-cyan-500/60 bg-cyan-500/10'
                : 'border-slate-700/70 bg-slate-800/40 hover:border-slate-600')
            }
          >
            <span className="text-xs font-bold text-slate-100">{base}</span>
            <span className="font-mono text-xs text-slate-200">
              {t ? fmtPrice(t.price) : '…'}
            </span>
            {t && (
              <span className={'font-mono text-[10px] ' + (up ? 'text-green-400' : 'text-red-400')}>
                {up ? '▲' : '▼'} {up ? '+' : ''}
                {t.changePct.toFixed(2)}%
              </span>
            )}
          </button>
        )
      })}
    </div>
  )
}
