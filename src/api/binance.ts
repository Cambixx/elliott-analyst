import type { Candle, UsdcPair } from '@/types/market'

/**
 * Base del REST de Binance. `data-api.binance.vision` (market-data-only) permite CORS
 * (Access-Control-Allow-Origin: *), así que se llama DIRECTAMENTE desde el navegador:
 * la petición sale desde la IP del usuario (no de un servidor proxy, que Binance bloquea
 * con 403 desde ciertas regiones/datacenters). El cliente llama a `${BASE}/v3/<endpoint>`.
 *
 * VITE_BINANCE_PROXY permite forzar un proxy propio si en alguna red el acceso directo falla.
 */
const BASE = (import.meta.env.VITE_BINANCE_PROXY ?? 'https://data-api.binance.vision/api').replace(
  /\/$/,
  '',
)

/** Host de WebSocket público (market data only). No está sujeto a CORS → directo desde el navegador. */
const WS_HOST = 'wss://data-stream.binance.vision:443'

/** Pares mostrados primero (los más líquidos). El resto se descubre vía exchangeInfo. */
const PREFERRED = ['BTC', 'ETH', 'SOL', 'BNB', 'XRP', 'ADA', 'AVAX', 'DOGE', 'LINK', 'MATIC']

/** Lista de respaldo por si exchangeInfo falla. */
export const FALLBACK_PAIRS: UsdcPair[] = PREFERRED.map((base) => ({
  symbol: `${base}USDC`,
  base,
}))

interface ExchangeInfoSymbol {
  symbol: string
  status: string
  baseAsset: string
  quoteAsset: string
}

/** Tupla cruda de Binance: [openTime, open, high, low, close, volume, closeTime, ...] */
type RawKline = [number, string, string, string, string, string, number, ...unknown[]]

/** Error de red con el código HTTP, para que el retry de TanStack pueda decidir. */
export class HttpError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message)
  }
}

async function getJson<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE}${path}`, { signal: AbortSignal.timeout(10_000) })
  if (!res.ok) {
    throw new HttpError(`Binance ${path} → HTTP ${res.status}`, res.status)
  }
  return res.json() as Promise<T>
}

/** Pares *USDC con status TRADING, ordenados por preferencia y luego alfabético. */
export async function fetchUsdcPairs(): Promise<UsdcPair[]> {
  const data = await getJson<{ symbols: ExchangeInfoSymbol[] }>('/v3/exchangeInfo')
  const pairs = data.symbols
    .filter((s) => s.quoteAsset === 'USDC' && s.status === 'TRADING')
    .map((s) => ({ symbol: s.symbol, base: s.baseAsset }))

  const rank = (base: string) => {
    const i = PREFERRED.indexOf(base)
    return i === -1 ? PREFERRED.length : i
  }
  return pairs.sort((a, b) => rank(a.base) - rank(b.base) || a.base.localeCompare(b.base))
}

/** Velas históricas (hasta 1000 por llamada). `interval` admite cualquier valor válido de Binance. */
export async function fetchKlines(
  symbol: string,
  interval: string,
  limit = 1000,
): Promise<Candle[]> {
  const raw = await getJson<RawKline[]>(
    `/v3/klines?symbol=${symbol}&interval=${interval}&limit=${limit}`,
  )
  // OJO: el endpoint /klines incluye la vela EN CURSO como último elemento.
  // Marcarla cerrada introduciría look-ahead (su high/low/close aún cambian),
  // así que derivamos `closed` del closeTime real (k[6], ms epoch).
  const now = Date.now()
  return raw.map((k) => ({
    timestamp: k[0],
    open: +k[1],
    high: +k[2],
    low: +k[3],
    close: +k[4],
    volume: +k[5],
    closed: k[6] < now,
  }))
}

export interface Ticker {
  symbol: string
  price: number
  changePct: number
}

interface RawTicker {
  symbol: string
  lastPrice: string
  priceChangePercent: string
}

/** Precio y cambio 24h de varios pares en una sola llamada (ticker/24hr). */
export async function fetchTickers(symbols: string[]): Promise<Record<string, Ticker>> {
  if (symbols.length === 0) return {}
  const param = encodeURIComponent(JSON.stringify(symbols))
  const raw = await getJson<RawTicker[]>(`/v3/ticker/24hr?symbols=${param}`)
  const out: Record<string, Ticker> = {}
  for (const t of raw) {
    out[t.symbol] = { symbol: t.symbol, price: +t.lastPrice, changePct: +t.priceChangePercent }
  }
  return out
}

interface RawTicker24 {
  symbol: string
  quoteVolume: string
}

/** Universo de pares *USDC más líquidos (top por volumen 24h) para el escáner.
 * Se intersecta con los pares con status TRADING para no incluir delistados. */
export async function fetchUsdcUniverse(limit = 40): Promise<string[]> {
  const [all, valid] = await Promise.all([
    getJson<RawTicker24[]>('/v3/ticker/24hr'),
    fetchUsdcPairs(),
  ])
  const tradeable = new Set(valid.map((p) => p.symbol))
  return all
    .filter((t) => tradeable.has(t.symbol))
    .sort((a, b) => +b.quoteVolume - +a.quoteVolume)
    .slice(0, limit)
    .map((t) => t.symbol)
}

interface KlineWsMessage {
  k: {
    t: number // open time
    o: string
    h: string
    l: string
    c: string
    v: string
    x: boolean // is closed
  }
}

/**
 * Suscribe al stream de velas en vivo, con RECONEXIÓN automática.
 * Binance cierra el socket cada 24 h (y puede caer por red/suspensión); sin esto,
 * el precio en vivo se congelaría en silencio. Reconecta con backoff exponencial
 * + jitter, y un watchdog reconecta si no llega ningún mensaje en 60 s.
 * El WebSocket de Binance no usa CORS, así que va directo desde el navegador.
 */
export function subscribeKline(
  symbol: string,
  interval: string,
  onCandle: (candle: Candle) => void,
): () => void {
  const stream = `${symbol.toLowerCase()}@kline_${interval}`
  let ws: WebSocket | null = null
  let closedByUser = false
  let retries = 0
  let reconnectTimer: ReturnType<typeof setTimeout> | undefined
  let watchdog: ReturnType<typeof setTimeout> | undefined

  const armWatchdog = () => {
    if (watchdog) clearTimeout(watchdog)
    watchdog = setTimeout(() => {
      try {
        ws?.close()
      } catch {
        /* noop */
      }
    }, 60_000)
  }

  const connect = () => {
    ws = new WebSocket(`${WS_HOST}/ws/${stream}`)
    ws.onopen = () => {
      retries = 0
      armWatchdog()
    }
    ws.onmessage = (event) => {
      armWatchdog()
      try {
        const msg = JSON.parse(event.data as string) as KlineWsMessage
        const k = msg.k
        onCandle({
          timestamp: k.t,
          open: +k.o,
          high: +k.h,
          low: +k.l,
          close: +k.c,
          volume: +k.v,
          closed: k.x,
        })
      } catch {
        // payload no-kline (ping/control): se ignora
      }
    }
    ws.onerror = () => {
      try {
        ws?.close()
      } catch {
        /* noop */
      }
    }
    ws.onclose = () => {
      if (watchdog) clearTimeout(watchdog)
      if (closedByUser) return
      const delay = Math.min(30_000, 1000 * 2 ** retries) + Math.random() * 1000
      retries++
      reconnectTimer = setTimeout(connect, delay)
    }
  }

  connect()

  return () => {
    closedByUser = true
    if (reconnectTimer) clearTimeout(reconnectTimer)
    if (watchdog) clearTimeout(watchdog)
    try {
      ws?.close()
    } catch {
      /* noop */
    }
  }
}
