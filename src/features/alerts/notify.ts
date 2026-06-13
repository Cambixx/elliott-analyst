/** Pide permiso de notificaciones del navegador (idempotente). */
export async function ensurePermission(): Promise<NotificationPermission> {
  if (!('Notification' in window)) return 'denied'
  if (Notification.permission === 'default') {
    try {
      return await Notification.requestPermission()
    } catch {
      return Notification.permission
    }
  }
  return Notification.permission
}

/** Envía una notificación del navegador si hay permiso (best-effort). */
export function sendNotification(title: string, body: string): void {
  if (!('Notification' in window) || Notification.permission !== 'granted') return
  try {
    new Notification(title, { body, icon: '/favicon.svg', tag: title })
  } catch {
    /* algunos navegadores requieren service worker; lo ignoramos en el MVP */
  }
}

export function notificationsSupported(): boolean {
  return typeof window !== 'undefined' && 'Notification' in window
}
