import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// data-api.binance.vision permite CORS, así que el frontend llama a Binance
// directamente (sin proxy). No se necesita configuración de servidor especial.
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  build: {
    rollupOptions: {
      output: {
        // Separa la librería del gráfico (pesada) en su propio chunk: mejor caché
        // y descarga en paralelo respecto al código de la app.
        manualChunks: {
          klinecharts: ['klinecharts'],
        },
      },
    },
  },
})
