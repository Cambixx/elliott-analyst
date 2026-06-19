import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { computeRealizedR, type JournalEntry, type TradeStatus } from '@/domain/journal'

interface JournalState {
  entries: JournalEntry[]
  /** Añade una anotación nueva (status 'abierta'). Devuelve su id. */
  add: (entry: Omit<JournalEntry, 'id' | 'createdAt' | 'status' | 'realizedR'>) => void
  /** Cambia el desenlace; si se cierra con precio de salida, recalcula el R realizado. */
  resolve: (id: string, status: TradeStatus, exitPrice?: number | null) => void
  updateNote: (id: string, note: string) => void
  remove: (id: string) => void
  clear: () => void
}

let counter = 0
const newId = () => `j${Date.now()}-${counter++}`

export const useJournalStore = create<JournalState>()(
  persist(
    (set) => ({
      entries: [],
      add: (entry) =>
        set((s) => ({
          entries: [
            { ...entry, id: newId(), createdAt: Date.now(), status: 'abierta', realizedR: null },
            ...s.entries,
          ],
        })),
      resolve: (id, status, exitPrice) =>
        set((s) => ({
          entries: s.entries.map((e) => {
            if (e.id !== id) return e
            // Reabrir: limpia todo lo del cierre (no deja precio/R/fecha obsoletos).
            if (status === 'abierta') {
              return { ...e, status, exitPrice: null, realizedR: null, closedAt: undefined }
            }
            const px = exitPrice ?? e.exitPrice ?? null
            // R realizado solo para ganada/perdida con precio de salida.
            const realizedR =
              (status === 'ganada' || status === 'perdida') && px != null
                ? computeRealizedR(e.entry, e.stop, px, e.bias)
                : null
            return { ...e, status, exitPrice: px, realizedR, closedAt: Date.now() }
          }),
        })),
      updateNote: (id, note) =>
        set((s) => ({ entries: s.entries.map((e) => (e.id === id ? { ...e, note } : e)) })),
      remove: (id) => set((s) => ({ entries: s.entries.filter((e) => e.id !== id) })),
      clear: () => set({ entries: [] }),
    }),
    { name: 'cripto-elliott-journal', version: 1 },
  ),
)
