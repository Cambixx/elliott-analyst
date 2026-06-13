import type { FearGreed, FearGreedLevel } from '@/api/market'
import { priceDivergence } from '@/api/market'
import { useFearGreed, useCoinMarket } from './useMarketContext'

const LEVEL_STYLE: Record<FearGreedLevel, string> = {
  'miedo-extremo': 'bg-red-500/15 text-red-300 border-red-500/30',
  miedo: 'bg-orange-500/15 text-orange-300 border-orange-500/30',
  neutral: 'bg-slate-500/15 text-slate-300 border-slate-500/30',
  codicia: 'bg-lime-500/15 text-lime-300 border-lime-500/30',
  'codicia-extrema': 'bg-green-500/15 text-green-300 border-green-500/30',
}

const ELLIOTT_NOTE: Record<FearGreedLevel, string> = {
  'miedo-extremo':
    'Suele coincidir con suelos de corrección (final de C). Atención a posibles reversiones al alza.',
  miedo: 'Fase correctiva o de dudas; oportunidades si la estructura alcista aguanta.',
  neutral: 'Sin extremo de sentimiento; el conteo manda.',
  codicia: 'Tendencia alcista madura; vigila agotamiento (posible onda 5).',
  'codicia-extrema':
    'Suele coincidir con techos de impulso (onda 5). Cautela con largos tardíos.',
}

const compactUsd = (n: number) =>
  '$' + new Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 2 }).format(n)

/** Chip compacto de Fear & Greed para la cabecera. */
export function FearGreedChip() {
  const { data } = useFearGreed()
  if (!data || !Number.isFinite(data.value)) return null
  return (
    <span
      className={
        'flex items-center gap-1.5 rounded-md border px-2 py-1 text-xs font-semibold ' +
        LEVEL_STYLE[data.level]
      }
      title="Fear & Greed Index (Alternative.me)"
    >
      <span className="font-mono">{data.value}</span>
      <span>{data.label}</span>
    </span>
  )
}

/**
 * Umbral de divergencia Binance vs CoinGecko que dispara el aviso. Holgado (3%)
 * porque el precio de CoinGecko es agregado y se actualiza con cierto retraso,
 * así que diferencias pequeñas son normales y no deben alarmar.
 */
const PRICE_DIVERGENCE_WARN = 0.03

/** Tarjeta de contexto de mercado para el panel: sentimiento + market cap. */
export function MarketContextCard({
  base,
  referencePrice,
}: {
  base: string
  /** Precio de la última vela CERRADA (no el tick vivo) para casar cadencia con CoinGecko. */
  referencePrice?: number | null
}) {
  const { data: fg } = useFearGreed()
  const { data: market } = useCoinMarket(base)

  if (!fg && !market) return null

  const divergence = priceDivergence(referencePrice, market?.price)
  const priceAnomaly = divergence != null && divergence > PRICE_DIVERGENCE_WARN

  return (
    <div className="rounded-lg border border-slate-700 bg-slate-800/40 p-3">
      <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-300">
        Contexto de mercado
      </span>

      {fg && Number.isFinite(fg.value) && (
        <div className="mt-2">
          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-400">Sentimiento</span>
            <span
              className={
                'ml-auto rounded border px-1.5 py-0.5 text-[10px] font-bold uppercase ' +
                LEVEL_STYLE[(fg as FearGreed).level]
              }
            >
              {fg.value} · {fg.label}
            </span>
          </div>
          <p className="mt-1 text-[11px] leading-relaxed text-slate-500">
            {ELLIOTT_NOTE[fg.level]}
          </p>
        </div>
      )}

      {market && (
        <dl className="mt-2 grid grid-cols-2 gap-2 text-xs">
          <div>
            <dt className="text-slate-500">Market cap</dt>
            <dd className="font-mono text-slate-300">
              {market.marketCap != null ? compactUsd(market.marketCap) : '—'}
            </dd>
          </div>
          <div>
            <dt className="text-slate-500">Cambio 24h</dt>
            {market.change24h != null ? (
              <dd
                className={'font-mono ' + (market.change24h >= 0 ? 'text-green-300' : 'text-red-300')}
              >
                {market.change24h >= 0 ? '+' : ''}
                {market.change24h.toFixed(2)}%
              </dd>
            ) : (
              <dd className="font-mono text-slate-400">—</dd>
            )}
          </div>
        </dl>
      )}

      {priceAnomaly && (
        <p className="mt-2 rounded border border-amber-600/40 bg-amber-950/30 px-2 py-1 text-[10px] leading-relaxed text-amber-200/90">
          ⚠ El precio en Binance difiere {(divergence! * 100).toFixed(1)}% del precio global
          (CoinGecko). Puede deberse a baja liquidez del par o a un desfase entre fuentes; revisa con
          cautela.
        </p>
      )}
    </div>
  )
}
