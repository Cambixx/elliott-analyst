import { useEffect, useRef, useState } from 'react'
import { useMarketStore } from '@/store/useMarketStore'
import { usePairs } from './usePairs'

/**
 * Selector de par con búsqueda: botón que abre un desplegable con input de
 * texto para filtrar entre los ~300 pares. Coincidencia exacta primero, luego
 * favoritos (★). Navegable por teclado (↑/↓, Enter, Escape) con ARIA de combobox.
 */
export function PairSelector() {
  const { symbol, setSymbol, favorites, toggleFavorite } = useMarketStore()
  const { data: pairs, isError } = usePairs()
  const isFav = favorites.includes(symbol)

  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [activeIdx, setActiveIdx] = useState(0)
  const rootRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLUListElement>(null)

  // Asegura que el par actual aparezca aunque no esté en la lista
  // (p.ej. seleccionado desde el escáner, o un par persistido ya delistado).
  const options = pairs ?? []
  const currentInList = options.some((p) => p.symbol === symbol)
  const allOptions = currentInList
    ? options
    : [{ symbol, base: symbol.replace(/USDC$/, '') }, ...options]

  const q = query.trim().toLowerCase()
  const matched = q ? allOptions.filter((p) => p.base.toLowerCase().includes(q)) : allOptions
  // Coincidencia exacta primero (que "sol" no quede detrás de un favorito por substring),
  // luego favoritos, luego el resto.
  const exact = q ? matched.filter((p) => p.base.toLowerCase() === q) : []
  const favs = matched.filter((p) => !exact.includes(p) && favorites.includes(p.symbol))
  const rest = matched.filter((p) => !exact.includes(p) && !favorites.includes(p.symbol))
  const filtered = [...exact, ...favs, ...rest]

  // Cerrar al clicar fuera o con Escape.
  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  // Al abrir: limpiar la búsqueda y enfocar el input.
  useEffect(() => {
    if (open) {
      setQuery('')
      setActiveIdx(0)
      inputRef.current?.focus()
    }
  }, [open])

  // Mantener la opción activa a la vista al navegar con el teclado.
  useEffect(() => {
    const el = listRef.current?.querySelector<HTMLElement>('[data-active="true"]')
    el?.scrollIntoView({ block: 'nearest' })
  }, [activeIdx])

  const select = (s: string) => {
    setSymbol(s)
    setOpen(false)
  }

  const onInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActiveIdx((i) => Math.min(i + 1, filtered.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActiveIdx((i) => Math.max(i - 1, 0))
    } else if (e.key === 'Enter') {
      const pick = filtered[activeIdx] ?? filtered[0]
      if (pick) select(pick.symbol)
    }
  }

  const activeId = filtered[activeIdx] ? `pair-opt-${filtered[activeIdx].symbol}` : undefined

  return (
    <div ref={rootRef} className="relative flex items-center gap-1.5">
      <span className="hidden text-xs font-medium text-slate-400 sm:inline">Par</span>

      <button
        type="button"
        onClick={() => toggleFavorite(symbol)}
        title={isFav ? 'Quitar de favoritos' : 'Añadir a favoritos'}
        aria-label={isFav ? 'Quitar de favoritos' : 'Añadir a favoritos'}
        aria-pressed={isFav}
        className={
          'text-base leading-none transition-colors ' +
          (isFav ? 'text-amber-400' : 'text-slate-500 hover:text-amber-300')
        }
      >
        <span aria-hidden="true">{isFav ? '★' : '☆'}</span>
      </button>

      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-label="Seleccionar par"
        className="flex items-center gap-1.5 rounded-md border border-slate-700 bg-slate-800 px-2 py-1.5 text-sm font-semibold text-slate-100 outline-none hover:border-slate-600 focus:border-cyan-500 sm:px-3"
      >
        {symbol.replace(/USDC$/, '')}/USDC
        <span aria-hidden="true" className="text-[10px] text-slate-400">
          {open ? '▲' : '▼'}
        </span>
      </button>

      {open && (
        <div className="absolute left-0 top-full z-50 mt-1 w-64 max-w-[calc(100vw-1.5rem)] rounded-md border border-slate-700 bg-slate-900 shadow-xl shadow-black/40">
          <div className="border-b border-slate-800 p-2">
            {/* text-base (16px): tamaños menores fuerzan zoom en iOS Safari al enfocar */}
            <input
              ref={inputRef}
              value={query}
              onChange={(e) => {
                setQuery(e.target.value)
                setActiveIdx(0)
              }}
              onKeyDown={onInputKeyDown}
              placeholder="Buscar par…"
              role="combobox"
              aria-expanded={open}
              aria-controls="pair-listbox"
              aria-activedescendant={activeId}
              aria-label="Buscar par"
              className="w-full rounded border border-slate-700 bg-slate-800 px-2 py-1.5 text-base text-slate-100 outline-none placeholder:text-slate-500 focus:border-cyan-500 sm:text-sm"
            />
          </div>
          <ul
            ref={listRef}
            id="pair-listbox"
            role="listbox"
            aria-label="Pares disponibles"
            className="max-h-72 overflow-y-auto p-1"
          >
            {filtered.length === 0 ? (
              <li className="px-2 py-2 text-xs text-slate-500">Sin resultados para «{query}»</li>
            ) : (
              filtered.map((p, i) => {
                const selected = p.symbol === symbol
                const active = i === activeIdx
                const fav = favorites.includes(p.symbol)
                return (
                  <li
                    key={p.symbol}
                    id={`pair-opt-${p.symbol}`}
                    role="option"
                    aria-selected={selected}
                    data-active={active || undefined}
                    onClick={() => select(p.symbol)}
                    onMouseEnter={() => setActiveIdx(i)}
                    className={
                      'flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-sm transition-colors ' +
                      (active
                        ? 'bg-slate-800 text-slate-100'
                        : selected
                          ? 'bg-cyan-500/15 text-cyan-200'
                          : 'text-slate-200')
                    }
                  >
                    <span className="font-semibold">{p.base}</span>
                    <span className="text-xs text-slate-500">/USDC</span>
                    {fav && (
                      <span aria-hidden="true" className="ml-auto text-xs text-amber-400">
                        ★
                      </span>
                    )}
                  </li>
                )
              })
            )}
          </ul>
        </div>
      )}

      {isError && <span className="text-xs text-amber-400">lista parcial</span>}
    </div>
  )
}
