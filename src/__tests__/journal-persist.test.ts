import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

/** localStorage en memoria para ejercitar la hidratación REAL del middleware persist. */
class MemStorage {
  store = new Map<string, string>()
  getItem(k: string) {
    return this.store.get(k) ?? null
  }
  setItem(k: string, v: string) {
    this.store.set(k, v)
  }
  removeItem(k: string) {
    this.store.delete(k)
  }
}

/** Payload EXACTO que escribe la versión actual del store (version 1). */
const seededEntry = {
  id: 'j1',
  createdAt: 0,
  symbol: 'BTCUSDC',
  base: 'BTC',
  timeframe: '4h',
  pattern: 'impulso',
  bias: 'compra',
  developing: false,
  entry: 100,
  stop: 90,
  target: 130,
  plannedRr: 3,
  confidence: 'alta',
  status: 'abierta',
  realizedR: null,
}

beforeEach(() => {
  vi.resetModules()
})
afterEach(() => {
  vi.unstubAllGlobals()
})

describe('useJournalStore — hidratación (persist)', () => {
  it('hidrata las entradas desde un payload persistido de la versión actual', async () => {
    const storage = new MemStorage()
    storage.setItem(
      'cripto-elliott-journal',
      JSON.stringify({ state: { entries: [seededEntry] }, version: 1 }),
    )
    // zustand persist lee window.localStorage por defecto (no el global suelto).
    vi.stubGlobal('window', { localStorage: storage })

    // Importar DESPUÉS de sembrar el storage y esperar a que persist rehidrate.
    const { useJournalStore } = await import('@/store/useJournalStore')
    await useJournalStore.persist.rehydrate()

    const { entries } = useJournalStore.getState()
    // GUARDIÁN: si alguien sube `version` sin `migrate`, zustand DESCARTA el payload v1 y
    // esto quedaría en 0 → borrado silencioso del diario de todos los usuarios. El test lo
    // cazaría en CI. Mantener version alineada (o añadir migrate) para conservar los datos.
    expect(entries).toHaveLength(1)
    expect(entries[0].id).toBe('j1')
    expect(entries[0].entry).toBe(100)
    expect(entries[0].status).toBe('abierta')
  })

  it('storage vacío → arranca con el diario vacío (sin lanzar)', async () => {
    vi.stubGlobal('window', { localStorage: new MemStorage() })
    const { useJournalStore } = await import('@/store/useJournalStore')
    await useJournalStore.persist.rehydrate()
    expect(useJournalStore.getState().entries).toEqual([])
  })
})
