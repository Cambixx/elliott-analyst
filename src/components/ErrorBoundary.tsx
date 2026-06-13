import { Component, type ErrorInfo, type ReactNode } from 'react'

interface Props {
  children: ReactNode
}
interface State {
  error: Error | null
}

/** Evita que un error en cualquier componente tumbe toda la app: muestra un fallback. */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Error en la app:', error, info.componentStack)
  }

  render() {
    if (this.state.error) {
      return (
        <div className="flex min-h-dvh flex-col items-center justify-center gap-4 p-6 text-center">
          <div className="h-3 w-3 rounded-full bg-red-400" />
          <h1 className="text-lg font-bold text-slate-100">Algo ha fallado</h1>
          <p className="max-w-md text-sm text-slate-400">
            La aplicación ha encontrado un error inesperado. Recarga la página para continuar.
          </p>
          <p className="max-w-md break-words font-mono text-xs text-slate-600">
            {this.state.error.message}
          </p>
          <button
            onClick={() => window.location.reload()}
            className="rounded-md border border-slate-600 bg-slate-800 px-4 py-2 text-sm font-semibold text-slate-100 hover:bg-slate-700"
          >
            Recargar
          </button>
        </div>
      )
    }
    return this.props.children
  }
}
