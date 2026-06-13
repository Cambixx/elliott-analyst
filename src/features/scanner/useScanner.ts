import { useCallback, useRef, useState } from 'react'
import { fetchKlines, fetchTickers, fetchUsdcUniverse, type Ticker } from '@/api/binance'
import { detectScenarios } from '@/domain/elliott/detector'
import { deriveOpportunity, scenarioBias, type Bias } from '@/domain/elliott/opportunity'
import { useMarketStore } from '@/store/useMarketStore'
import type { Confidence, Direction, ScenarioKind, ScenarioPattern } from '@/domain/elliott/types'

export interface ScanResult {
  symbol: string
  base: string
  price: number
  changePct: number | null
  pattern: ScenarioPattern
  direction: Direction
  kind: ScenarioKind
  score: number
  confidence: Confidence
  bias: Bias
  developing: boolean
  /** true si está en una zona accionable AHORA (alta confianza o precio en zona). */
  actionable: boolean
  title: string
}

const UNIVERSE_SIZE = 40
const CONCURRENCY = 8

/** Ejecuta `fn` sobre `items` con un máximo de `limit` en paralelo. */
async function mapLimit<T>(items: T[], limit: number, fn: (item: T) => Promise<void>) {
  let i = 0
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (i < items.length) {
      const item = items[i++]
      await fn(item)
    }
  })
  await Promise.all(workers)
}

/** Escanea los pares USDC más líquidos y los ordena por score de Elliott. */
export function useScanner() {
  const sensitivity = useMarketStore((s) => s.sensitivity)
  const [results, setResults] = useState<ScanResult[]>([])
  const [scanning, setScanning] = useState(false)
  const [progress, setProgress] = useState({ done: 0, total: 0 })
  const [error, setError] = useState<string | null>(null)
  const [lastScan, setLastScan] = useState<number | null>(null)
  const busy = useRef(false)

  const scan = useCallback(
    async (timeframe: string) => {
      if (busy.current) return
      busy.current = true
      setScanning(true)
      setError(null)
      try {
        const universe = await fetchUsdcUniverse(UNIVERSE_SIZE)
        const tickers = await fetchTickers(universe).catch(() => ({}) as Record<string, Ticker>)
        setProgress({ done: 0, total: universe.length })

        const out: ScanResult[] = []
        await mapLimit(universe, CONCURRENCY, async (symbol) => {
          try {
            const candles = await fetchKlines(symbol, timeframe, 1000)
            const closed = candles.filter((c) => c.closed)
            if (closed.length >= 50) {
              const { scenarios } = detectScenarios(closed, sensitivity)
              const primary = scenarios[0]
              if (primary) {
                // El precio "actual" sí puede ser el de la vela en curso.
                const price = candles[candles.length - 1].close
                out.push({
                  symbol,
                  base: symbol.replace(/USDC$/, ''),
                  price,
                  changePct: tickers[symbol]?.changePct ?? null,
                  pattern: primary.pattern,
                  direction: primary.direction,
                  kind: primary.kind,
                  score: primary.score,
                  confidence: primary.confidence,
                  bias: scenarioBias(primary),
                  developing: primary.developing,
                  actionable: deriveOpportunity(primary, price, 'equilibrado') !== null,
                  title: primary.title,
                })
              }
            }
          } catch {
            /* par concreto falla: seguimos */
          } finally {
            setProgress((p) => ({ ...p, done: p.done + 1 }))
          }
        })

        out.sort((a, b) => b.score - a.score)
        setResults(out)
        setLastScan(Date.now())
      } catch (e) {
        setError((e as Error)?.message ?? 'Error al escanear')
      } finally {
        busy.current = false
        setScanning(false)
      }
    },
    [sensitivity],
  )

  return { results, scanning, progress, error, lastScan, scan }
}
