/**
 * APIs gratuitas de contexto de mercado (complementan a Binance):
 *  - Alternative.me Fear & Greed Index (sentimiento, sin API key).
 *  - CoinGecko (market cap, cambio 24h; key Demo opcional vía VITE_COINGECKO_KEY).
 * Ambas permiten CORS, así que se llaman directo desde el navegador.
 */

const CG_BASE = 'https://api.coingecko.com/api/v3'
const CG_KEY = import.meta.env.VITE_COINGECKO_KEY

/** Mapa base (símbolo Binance) → id de CoinGecko para los pares más comunes. */
const COINGECKO_IDS: Record<string, string> = {
  BTC: 'bitcoin',
  ETH: 'ethereum',
  SOL: 'solana',
  BNB: 'binancecoin',
  XRP: 'ripple',
  ADA: 'cardano',
  AVAX: 'avalanche-2',
  DOGE: 'dogecoin',
  LINK: 'chainlink',
  MATIC: 'matic-network',
  DOT: 'polkadot',
  LTC: 'litecoin',
  TRX: 'tron',
  SUI: 'sui',
  TON: 'the-open-network',
}

export function coingeckoId(base: string): string | undefined {
  return COINGECKO_IDS[base]
}

export type FearGreedLevel =
  | 'miedo-extremo'
  | 'miedo'
  | 'neutral'
  | 'codicia'
  | 'codicia-extrema'

export interface FearGreed {
  value: number
  level: FearGreedLevel
  label: string
}

function classifyFearGreed(value: number): { level: FearGreedLevel; label: string } {
  if (value < 25) return { level: 'miedo-extremo', label: 'Miedo extremo' }
  if (value < 45) return { level: 'miedo', label: 'Miedo' }
  if (value <= 55) return { level: 'neutral', label: 'Neutral' }
  if (value < 75) return { level: 'codicia', label: 'Codicia' }
  return { level: 'codicia-extrema', label: 'Codicia extrema' }
}

interface FngResponse {
  data: { value: string; value_classification: string }[]
}

export async function fetchFearGreed(): Promise<FearGreed> {
  const res = await fetch('https://api.alternative.me/fng/?limit=1', {
    signal: AbortSignal.timeout(10_000),
  })
  if (!res.ok) throw new Error(`Fear&Greed → HTTP ${res.status}`)
  const json = (await res.json()) as FngResponse
  const value = Number(json.data[0]?.value ?? NaN)
  return { value, ...classifyFearGreed(value) }
}

export interface CoinMarket {
  marketCap: number | null
  change24h: number | null
  rank: number | null
  /** Precio global agregado (USD) según CoinGecko; para cross-check con Binance. */
  price: number | null
}

interface CgMarketRow {
  market_cap: number | null
  price_change_percentage_24h: number | null
  market_cap_rank: number | null
  current_price: number | null
}

const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null)

export async function fetchCoinMarket(base: string): Promise<CoinMarket | null> {
  const id = coingeckoId(base)
  if (!id) return null
  const headers: HeadersInit = CG_KEY ? { 'x-cg-demo-api-key': CG_KEY } : {}
  const res = await fetch(`${CG_BASE}/coins/markets?vs_currency=usd&ids=${id}`, {
    headers,
    signal: AbortSignal.timeout(10_000),
  })
  if (!res.ok) throw new Error(`CoinGecko → HTTP ${res.status}`)
  const rows = (await res.json()) as CgMarketRow[]
  const row = Array.isArray(rows) ? rows[0] : undefined
  if (!row) return null
  // CoinGecko puede devolver null en estos campos para ciertos activos.
  return {
    marketCap: num(row.market_cap),
    change24h: num(row.price_change_percentage_24h),
    rank: row.market_cap_rank ?? null,
    price: num(row.current_price),
  }
}

/**
 * Divergencia relativa entre el precio de Binance y el global de CoinGecko.
 * Devuelve la fracción |binance-global|/global, o null si falta algún dato.
 * Útil para avisar de posible baja liquidez/anomalía en el par de Binance.
 * NUNCA se usa CoinGecko para construir velas (agrega exchanges, granularidad gruesa).
 */
export function priceDivergence(binancePrice?: number | null, globalPrice?: number | null): number | null {
  if (binancePrice == null || globalPrice == null || globalPrice <= 0) return null
  return Math.abs(binancePrice - globalPrice) / globalPrice
}
