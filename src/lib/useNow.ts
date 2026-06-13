import { useEffect, useState } from 'react'

/** Reloj reactivo: devuelve Date.now() y lo refresca cada `everyMs` (default 15s). */
export function useNow(everyMs = 15_000): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), everyMs)
    return () => clearInterval(id)
  }, [everyMs])
  return now
}
