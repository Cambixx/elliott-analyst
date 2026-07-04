/** Vela OHLCV normalizada que consume el gráfico y (en Fase 2) el motor de Elliott. */
export interface Candle {
  /** Apertura de la vela en ms epoch (UTC). */
  timestamp: number
  open: number
  high: number
  low: number
  close: number
  volume: number
  /**
   * Volumen de compra AGRESORA (taker buy base volume, k[9]): parte del `volume` que
   * vino de órdenes market comprando contra el ask. Permite el delta de flujo real
   * (compras − ventas = 2·takerBuyVolume − volume). Opcional: velas cacheadas/sintéticas
   * (tests) pueden no traerlo → los consumidores degradan con gracia.
   */
  takerBuyVolume?: number
  /** true si la vela ya cerró (clave para no repintar la vela en curso). */
  closed: boolean
}

/** Temporalidades soportadas en la v1. Coinciden con los `interval` de Binance. */
export const TIMEFRAMES = ['15m', '1h', '4h', '1d', '1w'] as const
export type Timeframe = (typeof TIMEFRAMES)[number]

/** Par contra USDC disponible en Binance (status TRADING). */
export interface UsdcPair {
  /** Símbolo Binance, p.ej. "BTCUSDC". */
  symbol: string
  /** Activo base, p.ej. "BTC". */
  base: string
}
