import { useCallback, useRef, useState } from 'react'
import { fetchKlines, fetchTickers, fetchUsdcUniverse, binanceBannedForMs, type Ticker } from '@/api/binance'
import { detectScenariosMultiDegree } from '@/domain/elliott/detector'
import { degreeList } from '@/domain/elliott/backtest'
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
/** Caché válida de un escaneo (evita re-escanear 40 pares al volver a la pestaña). */
const SCAN_TTL_MS = 5 * 60 * 1000

interface CachedScan {
  results: ScanResult[]
  lastScan: number
}
// Caché a nivel de MÓDULO (sobrevive al desmontaje de ScannerView al cambiar de pestaña):
// clave = `${timeframe}:${sensitivity}`. Antes, cada visita relanzaba un escaneo completo.
const scanCache = new Map<string, CachedScan>()
const cacheKey = (tf: string, sensitivity: number) => `${tf}:${sensitivity}`

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
  /** Temporalidad a la que pertenecen los resultados actuales (para marcar los caducos). */
  const [resultsTf, setResultsTf] = useState<string | null>(null)
  const busy = useRef(false)

  /** Carga resultados cacheados si son frescos; devuelve true si evitó el escaneo. */
  const loadCached = useCallback(
    (timeframe: string): boolean => {
      const hit = scanCache.get(cacheKey(timeframe, sensitivity))
      if (hit && Date.now() - hit.lastScan < SCAN_TTL_MS) {
        setResults(hit.results)
        setLastScan(hit.lastScan)
        setResultsTf(timeframe)
        return true
      }
      return false
    },
    [sensitivity],
  )

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
              // Mismo pipeline multi-grado que el panel: el conteo del escáner coincide
              // con el que verá el usuario al abrir el par (antes divergían).
              const { scenarios } = detectScenariosMultiDegree(closed, degreeList(sensitivity))
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
          } catch (err) {
            // Par concreto falla (incl. 429/418 de rate-limit): seguimos, pero lo dejamos
            // en consola para que la degradación no sea totalmente silenciosa.
            console.warn(`escáner: ${symbol} falló`, err)
          } finally {
            setProgress((p) => ({ ...p, done: p.done + 1 }))
          }
        })

        out.sort((a, b) => b.score - a.score)
        const now = Date.now()
        // No cachear un escaneo DEGRADADO: si Binance limitó las peticiones durante el
        // barrido (breaker activo) muchos pares fallaron; cachearlo serviría 5 min una lista
        // parcial. Se muestra igualmente, pero no se persiste para forzar un re-escaneo.
        if (binanceBannedForMs() === 0) {
          scanCache.set(cacheKey(timeframe, sensitivity), { results: out, lastScan: now })
        }
        setResults(out)
        setLastScan(now)
        setResultsTf(timeframe)
      } catch (e) {
        setError((e as Error)?.message ?? 'Error al escanear')
      } finally {
        busy.current = false
        setScanning(false)
      }
    },
    [sensitivity],
  )

  return { results, scanning, progress, error, lastScan, resultsTf, scan, loadCached }
}
