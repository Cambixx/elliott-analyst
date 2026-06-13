import { useMarketStore } from '@/store/useMarketStore'
import { TIMEFRAMES } from '@/types/market'

export function TimeframeSelector() {
  const { interval, setInterval } = useMarketStore()

  return (
    <div className="flex items-center gap-1 rounded-md border border-slate-700 bg-slate-800 p-0.5">
      {TIMEFRAMES.map((tf) => (
        <button
          key={tf}
          onClick={() => setInterval(tf)}
          className={
            'rounded px-2.5 py-1 text-sm font-semibold transition-colors ' +
            (interval === tf
              ? 'bg-cyan-500 text-slate-900'
              : 'text-slate-300 hover:bg-slate-700')
          }
        >
          {tf}
        </button>
      ))}
    </div>
  )
}
