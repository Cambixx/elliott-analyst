/**
 * Datos de DERIVADOS de Binance Futures (USDT-perpetuos): funding rate y open
 * interest. `fapi.binance.com` permite CORS (`Access-Control-Allow-Origin: *`) y
 * NO bloquea por IP, así que se llama DIRECTO desde el navegador, sin backend.
 *
 * El análisis trabaja sobre pares SPOT *USDC, pero la liquidez y el posicionamiento
 * de derivados viven en el perpetuo USDT (BTCUSDC → BTCUSDT). Los pares sin perpetuo
 * devuelven error y el contexto de derivados simplemente no se muestra.
 */
const FAPI = 'https://fapi.binance.com'

/**
 * Resuelve el símbolo del perpetuo USDT real para un activo base SPOT. No basta con
 * `${base}USDT`: las familias de memecoins escaladas cotizan con multiplicador en
 * futuros (PEPE spot → 1000PEPEUSDT perp). Se prueban los multiplicadores conocidos
 * contra el conjunto real de perpetuos (de exchangeInfo). Devuelve null si no existe.
 */
const PERP_MULTIPLIERS = ['', '1000', '10000', '100000', '1000000']
export function resolvePerp(base: string, perps: Set<string>): string | null {
  for (const m of PERP_MULTIPLIERS) {
    const sym = `${m}${base}USDT`
    if (perps.has(sym)) return sym
  }
  return null
}

class FapiError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message)
  }
}

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { signal: AbortSignal.timeout(10_000) })
  if (!res.ok) throw new FapiError(`Binance Futures → HTTP ${res.status}`, res.status)
  return res.json() as Promise<T>
}

interface RawPremiumIndex {
  lastFundingRate: string
  markPrice: string
  nextFundingTime: number
}

interface RawOiHist {
  sumOpenInterest: string
  sumOpenInterestValue: string
  timestamp: number
}

export interface OiPoint {
  /** Open interest en notional USD. */
  value: number
  timestamp: number
}

interface RawFuturesSymbol {
  symbol: string
  contractType: string
  status: string
  quoteAsset: string
}

/** Conjunto de símbolos de perpetuos USDT activos (para resolver el perp de cada base). */
export async function fetchUsdtPerps(): Promise<Set<string>> {
  const data = await getJson<{ symbols: RawFuturesSymbol[] }>(`${FAPI}/fapi/v1/exchangeInfo`)
  const out = new Set<string>()
  for (const s of data.symbols) {
    if (s.contractType === 'PERPETUAL' && s.quoteAsset === 'USDT' && s.status === 'TRADING')
      out.add(s.symbol)
  }
  return out
}

export interface Derivatives {
  perp: string
  /** Funding rate del último periodo, como fracción por 8h (p.ej. 0.0001 = 0,01%/8h). */
  fundingRate: number
  markPrice: number
  /** ms epoch del próximo cobro de funding. */
  nextFundingTime: number
  /** Open interest actual en notional USD; null si no hay histórico disponible. */
  oiNotionalUsd: number | null
  /** Histórico de open interest (notional USD) para juzgar la tendencia. */
  oiHistory: OiPoint[]
}

/**
 * Funding + open interest del perpetuo USDT del activo. Una sola función para que
 * el hook haga una única consulta combinada. Lanza si el activo no tiene perpetuo.
 */
export async function fetchDerivatives(perp: string): Promise<Derivatives> {
  const [pi, oih] = await Promise.all([
    getJson<RawPremiumIndex>(`${FAPI}/fapi/v1/premiumIndex?symbol=${perp}`),
    // ~5 días de open interest en velas de 4h para juzgar la tendencia.
    getJson<RawOiHist[]>(`${FAPI}/futures/data/openInterestHist?symbol=${perp}&period=4h&limit=30`),
  ])

  const oiHistory: OiPoint[] = (Array.isArray(oih) ? oih : [])
    .map((r) => ({ value: +r.sumOpenInterestValue, timestamp: r.timestamp }))
    .filter((p) => Number.isFinite(p.value) && p.value > 0)

  return {
    perp,
    fundingRate: +pi.lastFundingRate,
    markPrice: +pi.markPrice,
    nextFundingTime: pi.nextFundingTime,
    // null (no 0) cuando no hay histórico, para distinguir "sin datos" de "OI cero".
    oiNotionalUsd: oiHistory.at(-1)?.value ?? null,
    oiHistory,
  }
}
