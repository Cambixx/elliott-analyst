import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { Timeframe } from '@/types/market'

interface MarketState {
  symbol: string
  interval: Timeframe
  /** Sensibilidad del ZigZag (k·ATR). Mayor = ondas de mayor grado / menos pivotes. */
  sensitivity: number
  showRsi: boolean
  showMacd: boolean
  /** Proyección hipotética de las ondas que faltan (3?/4?/5?...). Apagado por defecto. */
  showForecast: boolean
  /** Pares marcados como favoritos (acceso rápido en la barra de favoritos). */
  favorites: string[]
  setSymbol: (symbol: string) => void
  setInterval: (interval: Timeframe) => void
  setSensitivity: (sensitivity: number) => void
  toggleRsi: () => void
  toggleMacd: () => void
  toggleForecast: () => void
  toggleFavorite: (symbol: string) => void
}

/** Presets de grado de onda → valor k del ZigZag. */
export const SENSITIVITY_PRESETS = [
  { label: 'Menor', k: 1.8 },
  { label: 'Medio', k: 3 },
  { label: 'Mayor', k: 5 },
] as const

export const useMarketStore = create<MarketState>()(
  persist(
    (set) => ({
      symbol: 'BTCUSDC',
      interval: '1h',
      sensitivity: 3,
      showRsi: false,
      showMacd: false,
      showForecast: false,
      favorites: ['BTCUSDC', 'ETHUSDC', 'SOLUSDC', 'BNBUSDC'],
      setSymbol: (symbol) => set({ symbol }),
      setInterval: (interval) => set({ interval }),
      setSensitivity: (sensitivity) => set({ sensitivity }),
      toggleRsi: () => set((s) => ({ showRsi: !s.showRsi })),
      toggleMacd: () => set((s) => ({ showMacd: !s.showMacd })),
      toggleForecast: () => set((s) => ({ showForecast: !s.showForecast })),
      toggleFavorite: (symbol) =>
        set((s) => ({
          favorites: s.favorites.includes(symbol)
            ? s.favorites.filter((f) => f !== symbol)
            : [...s.favorites, symbol],
        })),
    }),
    {
      name: 'cripto-elliott-prefs',
      partialize: (s) => ({
        symbol: s.symbol,
        interval: s.interval,
        sensitivity: s.sensitivity,
        showRsi: s.showRsi,
        showMacd: s.showMacd,
        showForecast: s.showForecast,
        favorites: s.favorites,
      }),
    },
  ),
)
