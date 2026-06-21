# Cripto Elliott Analyst

Web app de análisis técnico de criptomonedas centrada en **pares contra USDC** en **Binance**, con primera fase enfocada en **Ondas de Elliott**.

> ⚠️ Herramienta de **apoyo a la decisión**, no de señales de compra/venta. Trabaja con escenarios probabilísticos, niveles de invalidación y advertencias de riesgo. El análisis técnico puede fallar; cada usuario es responsable de sus decisiones.

Documento de research y arquitectura completo: [`RESEARCH-ELLIOTT-Y-ARQUITECTURA.md`](./RESEARCH-ELLIOTT-Y-ARQUITECTURA.md).

## Stack

- **Vite + React 19 + TypeScript**
- **Tailwind CSS v4**
- **KLineChart** (velas + indicadores + dibujo de overlays)
- **TanStack Query** (datos REST) + **Zustand** (estado UI)
- **Binance `data-api.binance.vision`** llamado directamente desde el navegador (permite CORS); sin backend ni proxy. `VITE_BINANCE_PROXY` permite forzar uno si alguna red bloquea el acceso directo

## Estado actual (Fases 0-2)

- [x] Scaffolding Vite + React + TS + Tailwind
- [x] Proxy de Binance (Vite en dev, Cloudflare Worker en prod)
- [x] Selector de pares *USDC (dinámico vía `exchangeInfo`, con fallback)
- [x] Selector de temporalidad (15m · 1h · 4h · 1d · 1w)
- [x] **Favoritos**: estrella en el selector para marcar pares + **barra de favoritos** (tarjetas con símbolo, precio y cambio 24h, clic para seleccionar), persistida
- [x] **Selector de par con búsqueda**: desplegable con input de texto que filtra los ~300 pares (favoritos primero con ★, Enter elige el primero, Escape/click fuera cierra)
- [x] **Badge de sesgo en cada escenario** del panel: ▲ compra / ▼ venta / ⏸ vigilar (con tooltip), para ver de un vistazo qué sugiere cada conteo — siempre como posibilidad, no como señal
- [x] **Escáner de oportunidades** (pestaña Análisis/Escáner): escanea los ~40 pares USDC más líquidos (concurrencia limitada), corre el motor de Elliott en cada uno y los **lista por score**, con patrón, sesgo (compra/venta/vigilar) y confianza; clic en un resultado lo carga en el análisis
- [x] **Calculadora de gestión de riesgo** (`domain/risk.ts` + tarjeta en el panel): a partir del escenario primario deriva entrada (precio en vivo), **stop** (invalidación del impulso o extremo de la corrección, según el tipo), **objetivo conservador**, y con tu capital y % de riesgo calcula tamaño de posición, riesgo máximo y **R:R** coloreado; avisa si R:R < 1, si requiere apalancamiento o si el stop está demasiado cerca. Orientativa: no dice si entrar, dice si los números tienen sentido
- [x] Gráfico de velas con histórico (klines) y **vela en vivo por WebSocket**
- [x] Indicadores base: MA + Volumen, con RSI y MACD conmutables
- [x] **Fase 2:** motor de Elliott — ZigZag/ATR (anti-repaint) → 3 reglas cardinales → scoring Fibonacci → escenarios ranqueados
- [x] **Fase 2:** dibujo de ondas numeradas (1-5/A-C) + niveles Fibonacci + línea de invalidación + panel con escenarios y narrativa
- [x] Selector de **grado de onda** (Menor/Medio/Mayor = sensibilidad del ZigZag)
- [x] **Score de confluencia** (RSI divergencia onda 5, pico MACD/volumen onda 3, EMAs, Fibonacci): mezcla con el score estructural y se muestra como checklist 0–8
- [x] **Confirmación multi-timeframe**: contexto del marco superior (15m→1h→4h→1d→1w) con su sesgo de tendencia y conteo dominante; cada escenario se marca a favor/contra del marco superior
- [x] **Contexto de mercado**: Fear & Greed (Alternative.me) en cabecera y panel con interpretación en clave Elliott + market cap y cambio 24h (CoinGecko). Ambas APIs directas (CORS), sin proxy
- [x] **Contexto de derivados** (`api/binance-futures.ts` + `domain/derivatives.ts`): funding rate y open interest del perpetuo USDT (Binance Futures `fapi`, CORS directo, sin backend) con **lectura en clave Elliott** del posicionamiento — un funding extremo a favor del giro esperado lo refuerza (posicionamiento atrapado), en contra avisa de un posible squeeze previo. Es contexto de posicionamiento, no una señal. Los pares sin perpetuo USDT simplemente no muestran la tarjeta
- [x] **Persistencia de preferencias** (par, temporalidad, grado de onda, indicadores) en localStorage vía Zustand `persist`
- [x] **Patrones correctivos**: clasificación zigzag vs plana (incl. expandida), **triángulos** (A-B-C-D-E contractivos) y **diagonales finales** (cuña con solape 1-4). Cada patrón con color, insignia y narrativa propios; selección con diversidad (motriz + correctiva)
- [x] **Alertas y notificaciones**: vigilancia de una watchlist; cuando un par presenta una oportunidad accionable (confluencia alta, precio en zona objetivo o junto a la invalidación) genera una alerta con sesgo (compra/venta/vigilar) y una notificación del navegador
- [x] **Móvil / PWA**: layout responsive (cabecera compacta, scroll natural) + web app manifest, metas de iOS/Android e iconos para "Añadir a pantalla de inicio" (se abre en pantalla completa como una app)
- [x] **Fiabilidad de datos** (research-backed): el detector y los indicadores corren **solo sobre velas cerradas** (la vela en curso ya no actúa como pivote firme → sin repaint en vivo); `closed` se deriva del `closeTime` real de Binance. **Validación de integridad** de klines (huecos, duplicados, desorden) + **badge de frescura/integridad** en cabecera ("datos al día / con retraso / parados / faltan N velas"). El análisis se calcula sobre el cierre, no sobre el último trade
- [x] **Precisión del conteo** (research-backed): alternancia por **forma** (duración + profundidad de ondas 2/4, no solo profundidad), regla de **extensión única** (penaliza si W3 y W5 parecen ambas extendidas), **onda 5** puntuada contra sus tres relaciones (≈W1 / 0.618·W3 / 0.618·(W1+W3)), ideales de **onda C según el patrón** (zigzag/plana/expandida), y **penalización de conteos en desarrollo** (repintables) en el score
- [x] **Backtest + calibración** (`domain/elliott/backtest.ts` + `calibration.ts`): backtest **walk-forward sin look-ahead** (solo el prefijo pasado alimenta el conteo; el desenlace usa solo velas posteriores) que mide cuántas veces los conteos confirmados alcanzaron su zona objetivo antes que la invalidación. Corre en un **Web Worker** (fuera del hilo principal). Panel **"Fiabilidad histórica del motor"** por banda de score, y el score crudo se sustituye por **lenguaje de probabilidad honesto** ("señales fuertes/mixtas/débiles" + frecuencia observada cuando hay muestra ≥8), nunca un % puntual
- [x] **Canalización de Elliott** (`domain/elliott/channel.ts`): canal 0-2 / 1-3 dibujado bajo el impulso primario, proyección de onda 5 por la paralela del canal (con caso especial de onda 3 casi vertical) como confluencia con la zona Fibonacci, y factor de confluencia "precio contenido en el canal"
- [x] **Confluencia ponderada**: cada factor pesa según su valor informativo (los tautológicos como "estructura" pesan poco; divergencia RSI onda 5 y pico MACD onda 3 pesan más)
- [x] **Detección multi-grado**: el conteo se busca en varias sensibilidades (grado fino/medio/grueso) quedándose con el mejor de cada tipo, reduciendo la dependencia de un único `k`; **filtro fractal de Williams** que limpia micro-pivotes preservando la alternancia
- [x] **Calidad de pivotes**: marca causal (sin look-ahead) de pivotes formados en **mecha desproporcionada** (flash-crash/barrido de stops) o en **baja liquidez**, que penaliza el score y avisa
- [x] **Cross-check de precio**: aviso si el precio de Binance diverge >2% del precio global (CoinGecko) — posible baja liquidez/anomalía; nunca se usan datos de CoinGecko para construir velas
- [x] **Combinaciones correctivas dobles W-X-Y** (`scoreWxy`/`buildWxy` en detector.ts): detecta dobles three (dos correcciones unidas por una onda X conectora, 8 pivotes) reutilizando `scoreAbc`; compite como correctiva, con descuento por ambigüedad y aviso. Se dibuja con etiquetas a-b-W-X-a-b-Y y se excluye del backtest por ser demasiado ambigua
- [x] **Multi-grado enlazado** (factor de confluencia "subondas coherentes"): valida que la onda 3 subdivide en ~5 sub-swings y las ondas 2/4 en ~3, a un grado más fino derivado de la propia amplitud de la onda. Factor **suave** (no filtro), neutral si faltan datos; no aplica a diagonales (3-3-3-3-3)
- [x] **Transparencia de factores** (`calibration.ts` factorStats): el backtest registra qué factores de confluencia acompañan a los aciertos y el panel muestra su tasa observada con su N. Decisión honesta: NO se repesan dinámicamente los factores (con ~15 muestras por par el lift es ruidoso); se **muestra el dato observado** en vez de fingir una calibración precisa
- [x] **Pronósticos de ondas EN DESARROLLO** (lo más accionable): una onda en curso (5/C/Y) recibe **sesgo de continuación** hacia su objetivo (no "vigilar"), con **plan de gestión de riesgo** (stop = extremo de la onda previa, objetivo = zona proyectada), línea de **pronóstico explícita** en su tarjeta, y puede disparar **alertas**. Siempre marcado como "en desarrollo · puede repintar / mayor incertidumbre". La calculadora usa el escenario aislado si clicas uno
- [x] **Fiabilidad de pronósticos en desarrollo** (pista de backtest aparte): mide cuántas veces el pronóstico de continuación alcanzó su objetivo antes que la invalidación — la métrica que de verdad importa para operar ondas en curso (honestamente, suele ser menor que la de conteos confirmados)
- [x] **VWAP anclado + estructura de mercado** (`domain/vwap.ts` + `domain/elliott/levels.ts`): VWAP anclado al origen del conteo (referencia institucional, dibujado en el gráfico) + **soportes/resistencias** horizontales por clustering de pivotes (líneas verdes/rojas según estén bajo/sobre el precio), con una tarjeta "Estructura de mercado" que relaciona el precio con el VWAP y lista los niveles más fuertes. Confluencia, no señal
- [x] **Diario de operaciones** (`domain/journal.ts` + `store/useJournalStore.ts` + pestaña Diario): botón "Guardar en el diario" en la calculadora de riesgo que captura la hipótesis (par, TF, patrón, sesgo, entrada/stop/objetivo/R:R); luego marcas el desenlace con el precio de salida y calcula tu **win rate, R:R medio y R acumulado reales + win rate por patrón** — tu calibración PERSONAL, complementaria al backtest sintético. Persistido en localStorage
- [x] **Proyección de ondas completas** (toggle "Proyección", `domain/elliott/forecast.ts`): cuando está activo, dibuja como **hipótesis fantasma punteada** las ondas que faltan del conteo. Dos fuentes: (1) conteo EN DESARROLLO → completa la onda en curso (5/C/Y) + el movimiento siguiente; (2) impulso NACIENTE 0-1-2 → proyecta 3?/4?/5? con Fibonacci, pero **solo si va a favor del marco superior** (filtra ruido/sesgo). Zonas, no precios; '?' en cada etiqueta; apagado por defecto; disclaimer en panel. Mejoras de Fibonacci de paso: **sigma adaptativo** en `fibScore` (campana más ancha para extensiones) + ideales 0.382 (onda 2) y 2.0 (onda 3)
- [ ] **Fase 3+ (futuro):** sub-conteo enlazado completo (etiquetar subondas en el gráfico), combinaciones triples WXYXZ, pesos calibrados con acumulación cross-par/sesión

### Móvil / instalación en el teléfono

- **iOS (Safari):** abre la web → botón Compartir → "Añadir a pantalla de inicio".
- **Android (Chrome):** menú ⋮ → "Instalar app" / "Añadir a pantalla de inicio".
- Configurado vía `index.html` (metas `theme-color`, `apple-touch-icon`, `apple-mobile-web-app-*`) + `public/manifest.webmanifest` (display `standalone`, iconos 192/512/maskable/SVG).
- Iconos PNG generados sin dependencias con `npm run gen:icons` (`scripts/gen-icons.mjs`, codificador PNG con `zlib`).
- Nota: las notificaciones de alertas solo llegan con la web/app **abierta** (limitación de Web Notifications sin service worker).

### Alertas (`src/features/alerts/`, `src/domain/elliott/opportunity.ts`)

- `deriveOpportunity(scenario, price)` decide si un conteo es "accionable ahora" y su sesgo honesto (compra/venta/vigilar) — nunca una orden.
- `useAlertMonitor` re-escanea la watchlist en el intervalo configurable (1/2/5/15 min, por defecto 2), en la temporalidad/grado seleccionados, con cooldown de 4 h por firma de alerta para no repetir.
- **Nivel de oportunidad** configurable (afecta cuántas alertas saltan):
  - *Estricto*: solo confianza alta **y** precio en zona de decisión (objetivo o invalidación).
  - *Equilibrado* (por defecto): confianza alta sola, o media + precio en zona.
  - *Amplio*: confianza media o alta en cualquier punto, o precio en zona.
- Notificaciones del navegador (Web Notifications API) **mientras la pestaña está abierta**, aunque esté en segundo plano. Para notificaciones con el navegador cerrado haría falta service worker + push server + backend (mejora futura). Las alertas se ven siempre en el panel aunque se denieguen las notificaciones.
- Al **activar**, se pide permiso *antes* de arrancar el primer escaneo (si no, ese escaneo consumía las oportunidades sin avisar), se **reinicia el cooldown** (re-avisa de las oportunidades actuales) y se envía una **notificación de confirmación**.
- **Indicador en el título de la pestaña**: si llegan alertas con la pestaña en segundo plano, el título muestra `(N) 🔔 Cripto Elliott Analyst`; se limpia al volver a la pestaña. Así te enteras aunque estés en otra pestaña, incluso si el SO suprime la notificación.
- Campana para activar/desactivar; **botón "probar"** (notificación de prueba); "comprobar ahora" para forzar un escaneo; watchlist editable; nivel e intervalo configurables.

### Patrones detectados

| Patrón | Tipo | Color |
|---|---|---|
| Impulso 1-2-3-4-5 | motriz | cian |
| Diagonal final (cuña, solape 1-4) | motriz | teal |
| Zigzag (5-3-5) | correctivo | ámbar |
| Plana / flat (3-3-5, incl. expandida) | correctivo | naranja |
| Triángulo (A-B-C-D-E contractivo) | correctivo | violeta |

El detector siempre muestra la mejor estructura **motriz** y la mejor **correctiva** (más una tercera), para no sesgar hacia un solo tipo de conteo.

En el **gráfico** se dibujan TODOS los escenarios detectados: el **primario** (más probable) a plena opacidad y los **alternativos atenuados** (color con alpha, línea más fina, etiquetas tenues), para ver visualmente los posibles escenarios sin perder la jerarquía. Click en una tarjeta del panel aísla ese conteo; otro click vuelve a la vista completa.

**Proyección punteada** (`features/chart/projectionOverlay.ts`): del escenario más probable se dibujan líneas discontinuas desde su último pivote hacia sus **objetivos** (los dos bordes de la zona en impulsos/triángulos — en triángulos, la ruptura en ambas direcciones —, o el origen de la corrección al reanudarse la tendencia), con el precio etiquetado en el extremo. Es una hipótesis visual, no una predicción.

**Zona de retroceso de Fibonacci** (`domain/elliott/fibZone.ts`, inspirada en el indicador de LuxAlgo, reimplementada): cuando hay un impulso/diagonal **completado**, se dibujan a ancho completo sus niveles de retroceso (0.382 / 0.5 / 0.618 / 0.786) con la **banda dorada 0.382–0.618 resaltada** — la zona donde se espera que termine la corrección. Se **recolorea**: verde si está intacta, rojo si el precio ya retrocedió más allá del 0.786. El panel incluye una **leyenda** que explica qué significa la banda y los colores.

**Relaciones de onda (Fibonacci)** (`domain/elliott/relations.ts`): cada escenario muestra en el panel la proporción entre sus ondas (p.ej. "Onda 3 = 1.62 × onda 1"), con anotación del ratio de Fibonacci más cercano (≈ 0.382 / 0.618 / 1.618…). Educativo y reutiliza los pivotes ya detectados. El gráfico **se auto-encuadra al rango de las ondas dibujadas** cada vez que cambian (cambio de par/temporalidad/grado o al aislar un conteo), así las estructuras quedan siempre bien encuadradas y nunca fuera de la vista. Al **hacer click en una tarjeta** del panel, ese conteo se aísla en el gráfico (con Fibonacci + invalidación); otro click vuelve a la vista general.

### Indicadores y confluencia

- `src/domain/indicators/` — RSI (Wilder), MACD (12/26/9), EMA (20/50/200) y **OBV** (On-Balance Volume, acumulado causal) como funciones puras.
- `src/domain/elliott/confluence.ts` — evalúa 8 factores para impulsos (4 para ABC) que confirman o refutan el conteo. El score final del escenario es `0.5·estructura + 0.5·confluencia`.
- **Lectura VSA de volumen** (`src/domain/elliott/vsa.ts`, integración de la capa medible de Wyckoff/Volume Spread Analysis): el factor de volumen lee **esfuerzo vs resultado** en el pivote de giro que Elliott ya detectó (fin de onda 5 / fin de onda C). Esfuerzo = volumen normalizado por **percentil/rank causal** sobre las velas anteriores (robusto al wash-trading de cripto: solo orden, no magnitud); resultado = CLV `(close−low)/(high−low)`. Clímax/absorción = esfuerzo alto **con** rechazo del extremo (predicado único en AND, no infla el disparo). Reemplaza la antigua heurística de volumen por medias; sigue siendo factor **suave** (mismas `key`/peso) y degrada en `wick_spike`. La divergencia de onda 5 (`div5`) se **corrobora con OBV** (AND debilitante: solo puede bajar su frecuencia de disparo, nunca subirla). Es confluencia probabilística, no señal.

### Motor de Elliott (`src/domain/elliott/`)

- `atr.ts` — ATR (Wilder) como umbral adaptativo.
- `zigzag.ts` — detección de pivotes; el último se marca provisional (anti-repaint).
- `fibonacci.ts` — scoring gaussiano de cercanía a ratios ideales.
- `detector.ts` — valida las 3 reglas cardinales (filtro duro), puntúa por Fibonacci/alternancia, y construye escenarios con invalidación, objetivos y narrativa. Devuelve top-2 (primario + alternativo), nunca "el" conteo.

## Desarrollo

```bash
npm install
npm run dev          # http://localhost:5173
npm test             # suite de tests (vitest) del motor: zigzag, detector, fibZone, riesgo, proyección…
npm run lint         # eslint
```

Los tests (`src/__tests__/`) cubren la lógica del dominio con datos sintéticos deterministas,
incluidas regresiones de bugs reales encontrados en auditoría (pivote fantasma del ZigZag,
RSI plano, zona Fib "rota" por la vela del pivote, `inTarget` degenerado en triángulos,
onda 5 extendida con objetivo por detrás del precio).

La app llama a `data-api.binance.vision` **directamente desde el navegador** (ese dominio
permite CORS: `Access-Control-Allow-Origin: *`). No hace falta proxy ni backend.

## Despliegue (producción)

Cualquier hosting estático sirve (Netlify, Vercel, Cloudflare Pages, GitHub Pages…):
`npm run build` y publica `dist/`. No se necesita ninguna variable de entorno ni proxy.

### Despliegue automático en Netlify (push a `main` → deploy)

El proyecto ya trae la configuración en [`netlify.toml`](./netlify.toml) (build `npm run build`,
publish `dist/`, Node 20, cabeceras de caché) y el fallback SPA en [`public/_redirects`](./public/_redirects).
Para que cada push a `main` despliegue solo, hay que **conectar el repositorio una vez** en Netlify:

1. En Netlify: **Add new site → Import an existing project** (o, si ya tienes el sitio creado a mano,
   **Site configuration → Build & deploy → Continuous deployment → Link repository**).
2. Elige **GitHub** y autoriza el acceso al repo `Cambixx/elliott-analyst`.
3. Netlify detecta `netlify.toml`, así que el **build command** (`npm run build`) y el **publish
   directory** (`dist`) ya vienen rellenos. Branch a desplegar: **`main`**. Pulsa **Deploy**.
4. A partir de ahí: cada `git push` a `main` lanza un build y publica automáticamente. Las pull
   requests generan **Deploy Previews** (una URL por PR) sin tocar producción.

> Variables de entorno opcionales (Netlify → Site configuration → Environment variables): ninguna es
> necesaria. `VITE_COINGECKO_KEY` (clave Demo de CoinGecko) solo sube los límites de esa API;
> `VITE_BINANCE_PROXY` solo si en tu red el acceso directo a Binance fallara.

> **Importante — por qué NO se usa un proxy de servidor:** Binance responde **403** a las
> peticiones que vienen de IPs de datacenter/algunas regiones (p.ej. los servidores de
> Netlify). Llamando **directamente desde el navegador**, la petición sale desde la IP del
> usuario, así que funciona. Si en alguna red el acceso directo fallara, se puede forzar un
> proxy propio definiendo `VITE_BINANCE_PROXY` con su URL, pero por defecto NO se usa.

## Robustez (tras auditoría)

- **WebSocket con reconexión** automática (backoff + watchdog): Binance cierra el socket cada 24 h; el precio en vivo ya no se congela.
- **Error Boundary** global: un error en cualquier componente muestra un fallback con recarga, no tumba la app.
- **Timeouts** en todas las peticiones (`AbortSignal.timeout`) y **retry inteligente** (no reintenta 429/418/451/403).
- **CoinGecko**: `change24h`/`market_cap` pueden ser `null` → se manejan sin crash.
- **Alertas**: temporalidad de vigilancia **propia** (`alertTimeframe`, independiente del gráfico); cambiar ajustes ya no relanza escaneos ni re-notifica.
- **Precios adaptativos** (`src/lib/format.ts`): las monedas baratas (SHIB/PEPE…) ya no se muestran como "0".
- **Accesibilidad**: `aria-label` en los botones de icono (estrella, ×).

## Notas de datos

- REST: `https://data-api.binance.vision/api` (market data, sin API key). Klines máx 1000/llamada, peso 2, límite 6000 weight/min/IP.
- WebSocket: `wss://data-stream.binance.vision:443` (sin CORS, directo desde el navegador). El flag `x` indica si la vela cerró.
- Complementos previstos: CoinGecko (market cap) y Alternative.me Fear & Greed (sentimiento).
