import { create } from 'zustand'
import { persist } from 'zustand/middleware'

interface RiskState {
  /** Capital de la cuenta en USDC. */
  capital: number
  /** % del capital arriesgado por operación. */
  riskPct: number
  /**
   * Colchón del stop en múltiplos de ATR. 0 = stop pegado al nivel de invalidación
   * (comportamiento por defecto: no altera los números de nadie sin pedirlo).
   */
  stopBufferAtr: number
  setCapital: (capital: number) => void
  setRiskPct: (riskPct: number) => void
  setStopBufferAtr: (stopBufferAtr: number) => void
}

export const RISK_PCT_OPTIONS = [0.5, 1, 2, 3] as const

export const useRiskStore = create<RiskState>()(
  persist(
    (set) => ({
      capital: 1000,
      riskPct: 1,
      stopBufferAtr: 0,
      setCapital: (capital) => set({ capital: Math.max(0, capital) }),
      setRiskPct: (riskPct) => set({ riskPct }),
      setStopBufferAtr: (stopBufferAtr) => set({ stopBufferAtr: Math.max(0, stopBufferAtr) }),
    }),
    { name: 'cripto-elliott-risk' },
  ),
)
