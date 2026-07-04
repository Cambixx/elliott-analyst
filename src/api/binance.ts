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
const PREFERRED = ['BTC', 'ETH', 'SOL', 'BNB', 'XRP', 'ADA', 'AVAX', 'DOGE', 'LINK', 'POL']

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

/**
 * Tupla cruda de Binance:
 * [0 openTime, 1 open, 2 high, 3 low, 4 close, 5 volume, 6 closeTime, 7 quoteVolume,
 *  8 numTrades, 9 takerBuyBaseVolume, 10 takerBuyQuoteVolume, 11 ignore]
 */
type RawKline = [number, string, string, string, string, string, number, string, number, string, ...unknown[]]

/** Error de red con el código HTTP, para que el retry de TanStack pueda decidir. */
export class HttpError extends Error {
  constructor(
    message: string,
    public status: number,
    /** Espera sugerida antes de reintentar (ms), derivada de Retry-After en 429/418. */
    public retryAfterMs?: number,
  ) {
    super(message)
  }
}

/**
 * Circuit breaker MÓDULO-GLOBAL: cuando Binance devuelve 429 (rate-limit) o 418 (ban por
 * IP), seguir martilleando el endpoint PROLONGA el bloqueo. Guardamos hasta cuándo estamos
 * vetados y rechazamos localmente (sin salir a red) hasta que expire. Cubre de una vez a
 * useQuery, al escáner y al monitor de alertas, que comparten este cliente.
 */
let bannedUntil = 0
/** ms restantes de veto de Binance (0 si no hay). Para que la UI lo comunique. */
export function binanceBannedForMs(): number {
  return Math.max(0, bannedUntil - Date.now())
}

async function getJson<T>(path: string): Promise<T> {
  const wait = bannedUntil - Date.now()
  if (wait > 0) {
    throw new HttpError(`Binance limitado; reintenta en ${Math.ceil(wait / 1000)}s`, 429, wait)
  }
  const res = await fetch(`${BASE}${path}`, { signal: AbortSignal.timeout(10_000) })
  if (!res.ok) {
    if (res.status === 429 || res.status === 418) {
      const header = Number(res.headers.get('Retry-After'))
      const retryAfterMs = Number.isFinite(header) && header > 0 ? header * 1000 : 60_000
      bannedUntil = Date.now() + retryAfterMs
      throw new HttpError(`Binance ${path} → HTTP ${res.status}`, res.status, retryAfterMs)
    }
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
  // OJO: el endpoint /klines devuelve las velas en orden y la EN CURSO es siempre
  // la ÚLTIMA. Por construcción todas menos la última están cerradas (no dependen
  // del reloj del cliente); solo la última se decide por su closeTime (k[6]) vs ahora.
  // Así un reloj adelantado, como mucho, afecta a una sola vela, no a todo el set.
  // MARGEN: exigimos que hayan pasado ≥ CLOSE_MARGIN_MS desde el closeTime para
  // marcarla cerrada. Vuelca el error de un reloj adelantado hacia el lado SEGURO
  // (una vela recién cerrada tarda unos segundos en contarse como tal), en vez de
  // marcar cerrada una vela aún en formación → sin look-ahead por desvío de reloj.
  const now = Date.now()
  const lastIdx = raw.length - 1
  return raw.map((k, i) => ({
    timestamp: k[0],
    open: +k[1],
    high: +k[2],
    low: +k[3],
    close: +k[4],
    volume: +k[5],
    takerBuyVolume: +k[9], // compra agresora (base): base del delta de flujo real
    closed: i < lastIdx ? true : k[6] < now - CLOSE_MARGIN_MS,
  }))
}

/** Margen conservador (ms) para considerar cerrada la última vela: absorbe un desvío
 *  moderado del reloj del cliente sin degradar la frescura de forma perceptible. */
const CLOSE_MARGIN_MS = 3_000

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
    v: string // base volume
    V: string // taker buy base volume (compra agresora)
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
  let msgId = 1
  let reconnectTimer: ReturnType<typeof setTimeout> | undefined
  let watchdog: ReturnType<typeof setTimeout> | undefined
  let keepalive: ReturnType<typeof setInterval> | undefined

  // Keepalive de aplicación: en pares ILÍQUIDOS puede no llegar ninguna vela en >60s
  // y el watchdog mataría una conexión SANA (bucle de reconexión perpetuo). Pedimos la
  // lista de suscripciones cada 25s; la respuesta de Binance dispara onmessage (que
  // rearma el watchdog) y cae en el catch de payload no-kline sin efectos.
  const stopKeepalive = () => {
    if (keepalive) clearInterval(keepalive)
    keepalive = undefined
  }
  const startKeepalive = () => {
    stopKeepalive()
    keepalive = setInterval(() => {
      try {
        if (ws?.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ method: 'LIST_SUBSCRIPTIONS', id: msgId++ }))
        }
      } catch {
        /* noop */
      }
    }, 25_000)
  }

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
      startKeepalive()
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
          takerBuyVolume: +k.V,
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
      stopKeepalive()
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
    stopKeepalive()
    try {
      ws?.close()
    } catch {
      /* noop */
    }
  }
}
