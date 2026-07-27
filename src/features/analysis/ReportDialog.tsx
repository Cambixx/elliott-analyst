import { useEffect, useRef, useState } from 'react'
import type { ReportSection } from '@/domain/report'
import { reportToMarkdown } from '@/domain/report'

/** Colorea las marcas del informe ([✓] a favor, [✗] en contra, [~] matiz) sin parsear nada. */
function lineClass(line: string): string {
  const t = line.trimStart()
  if (t.startsWith('[✓]')) return 'text-green-300'
  if (t.startsWith('[✗]')) return 'text-red-300'
  if (t.startsWith('[~]')) return 'text-amber-300'
  if (t.startsWith('Aviso:')) return 'text-amber-300'
  if (t.startsWith('PRINCIPAL') || t.startsWith('ALTERNATIVO')) return 'font-semibold text-slate-100'
  return 'text-slate-300'
}

/**
 * Informe de situación en un diálogo modal: reúne en un solo texto todo lo que la app ya
 * ha calculado (escenarios, confluencia, contexto, estructura, riesgo, fiabilidad) y permite
 * copiarlo al portapapeles —p.ej. para pegarlo en el diario o en otra herramienta—.
 */
export function ReportDialog({
  sections,
  title,
  onClose,
}: {
  sections: ReportSection[]
  title: string
  onClose: () => void
}) {
  const [copyState, setCopyState] = useState<'idle' | 'ok' | 'error'>('idle')
  const closeRef = useRef<HTMLButtonElement>(null)
  const copiedTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  // Cerrar con Escape + foco inicial en el botón de cierre (accesible con teclado).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    closeRef.current?.focus()
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])
  useEffect(() => () => clearTimeout(copiedTimer.current), [])

  const handleCopy = async () => {
    const md = reportToMarkdown(sections, title)
    let ok = false
    // La Clipboard API falla si el documento no tiene foco, sin permisos o fuera de HTTPS;
    // en ese caso se intenta el camino clásico (textarea + execCommand), que funciona en
    // más contextos. Si TAMPOCO va, hay que decírselo al usuario: un botón que no hace
    // nada y no explica por qué es peor que un error.
    try {
      await navigator.clipboard.writeText(md)
      ok = true
    } catch {
      try {
        const ta = document.createElement('textarea')
        ta.value = md
        ta.setAttribute('readonly', '')
        ta.style.position = 'fixed'
        ta.style.opacity = '0'
        document.body.appendChild(ta)
        ta.select()
        ok = document.execCommand('copy')
        document.body.removeChild(ta)
      } catch {
        ok = false
      }
    }
    setCopyState(ok ? 'ok' : 'error')
    clearTimeout(copiedTimer.current)
    copiedTimer.current = setTimeout(() => setCopyState('idle'), 2500)
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 p-3 sm:p-6"
      onClick={onClose}
      role="presentation"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="flex max-h-full w-full max-w-3xl flex-col overflow-hidden rounded-lg border border-slate-700 bg-slate-900 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex shrink-0 items-center gap-2 border-b border-slate-800 px-4 py-3">
          <h2 className="text-sm font-bold tracking-wide text-slate-100">{title}</h2>
          <div className="ml-auto flex items-center gap-2">
            <button
              onClick={handleCopy}
              className={
                'rounded border px-2.5 py-1 text-xs font-semibold transition-colors ' +
                (copyState === 'error'
                  ? 'border-amber-600 text-amber-200'
                  : 'border-slate-600 text-slate-200 hover:bg-slate-800')
              }
              title={
                copyState === 'error'
                  ? 'El navegador bloqueó el portapapeles: selecciona el texto y cópialo a mano'
                  : 'Copiar el informe en Markdown'
              }
            >
              {copyState === 'ok' ? '✓ Copiado' : copyState === 'error' ? 'No se pudo copiar' : 'Copiar'}
            </button>
            <button
              ref={closeRef}
              onClick={onClose}
              aria-label="Cerrar informe"
              className="rounded border border-slate-600 px-2.5 py-1 text-xs font-semibold text-slate-200 transition-colors hover:bg-slate-800"
            >
              Cerrar
            </button>
          </div>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
          {sections.map((s) => (
            <section key={s.title} className="mb-4 last:mb-0">
              <h3 className="mb-1 text-[11px] font-bold uppercase tracking-wider text-cyan-300">
                {s.title}
              </h3>
              <div className="space-y-1">
                {s.lines.map((l, idx) =>
                  l === '' ? (
                    <div key={idx} className="h-2" />
                  ) : (
                    <p
                      key={idx}
                      className={`whitespace-pre-wrap text-xs leading-relaxed ${lineClass(l)}`}
                    >
                      {l}
                    </p>
                  ),
                )}
              </div>
            </section>
          ))}
        </div>
      </div>
    </div>
  )
}
