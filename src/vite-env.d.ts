/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Base del proxy REST de Binance. Dev: '/binance' (proxy de Vite). Prod: URL del Worker. */
  readonly VITE_BINANCE_PROXY?: string
  /** Demo API key opcional de CoinGecko (sube el rate limit del free tier). */
  readonly VITE_COINGECKO_KEY?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
