# Cripto Elliott Analyst — Research + Arquitectura (v1)

> Documento de fundamentación para una web app de análisis técnico cripto centrada en **pares contra USDC** en **Binance**, con primera fase enfocada en **Ondas de Elliott**.
> Generado el 2026-06-08 a partir de una investigación multiagente con verificación adversarial de los datos técnicos (endpoints, rate limits, licencias, paquetes npm).
>
> **Aviso permanente del producto:** esto es una herramienta de *apoyo a la decisión*. No emite señales de compra/venta como certezas. Trabaja con escenarios probabilísticos, niveles de invalidación y advertencias de riesgo. El análisis técnico puede fallar; el usuario es responsable de sus decisiones.

---

## 1. Research: Ondas de Elliott aplicadas a cripto

### 1.1 Qué son
Ralph Nelson Elliott (1871–1948) describió en *The Wave Principle* (1938) que el precio no se mueve al azar, sino en **patrones repetitivos** que reflejan la psicología colectiva (miedo/codicia). El mercado alterna:

- **Fase motriz / impulsiva** (a favor de la tendencia): **5 ondas** (1-2-3-4-5).
- **Fase correctiva** (contra la tendencia): **3 ondas** (A-B-C).

Es **fractal/autosimilar**: cada onda se subdivide en ondas de grado menor y forma parte de una de grado mayor. Un ciclo completo = 5 + 3 = **8 ondas** (números de Fibonacci: 5, 3, 8, 13, 21, 34...).

### 1.2 Ondas impulsivas vs correctivas
- **Impulso (5 ondas):** 1, 3, 5 = motrices; 2, 4 = correctivas. Subdivisión interna típica **5-3-5-3-5**.
- **Corrección (A-B-C):** retroceso del impulso previo. Forma según el patrón (ver 1.5).
- **Grados (degrees):** Grand Supercycle → Supercycle → Cycle → Primary → Intermediate → Minor → Minute → Minuette → Subminuette. El etiquetado debe ser coherente entre grados (no mezclar).

### 1.3 Reglas de conteo

**3 REGLAS CARDINALES (inviolables — si se rompen, el conteo es inválido):**
1. La **onda 2 nunca retrocede más del 100%** de la onda 1 (no rompe el origen de la 1).
2. La **onda 3 nunca es la más corta** entre 1, 3 y 5 (normalmente es la más larga).
3. La **onda 4 no solapa el territorio de precio de la onda 1**. *Excepción: las diagonales*, donde el solapamiento sí es característico.

**GUÍAS (tendencias frecuentes, no obligatorias):**
- **Alternancia:** si la onda 2 es profunda/aguda, la onda 4 tiende a ser lateral/superficial, y viceversa.
- **Igualdad:** dos de las tres motrices tienden a igualarse (típico: onda 5 ≈ onda 1 cuando la 3 es la extendida).
- **Canalización:** el impulso se desarrolla dentro de un canal paralelo (extremos de 2-4).
- **Truncamiento de onda 5:** la 5 no supera el extremo de la 3 → debilidad, precede a reversión brusca.
- **Extensión:** normalmente **solo una** de 1/3/5 se extiende. En cripto/acciones suele ser la **onda 3**.

**Relaciones de Fibonacci típicas (guías estadísticas para *scoring*, no reglas):**
| Relación | Niveles habituales |
|---|---|
| Onda 2 (retroceso de 1) | 0.5 / 0.618 / 0.786 (cripto: 0.618–0.886) |
| Onda 3 (extensión de 1) | 1.618 / 2.618 |
| Onda 4 (retroceso de 3) | 0.236 / 0.382 |
| Onda 5 | = onda 1, o 0.618 × onda 3 |
| Onda C | ≈ A, o 1.618 × A |

### 1.4 Errores comunes
- **Subjetividad / sesgo de confirmación:** etiquetar lo que uno quiere ver.
- **Recontar a posteriori:** ajustar el conteo en silencio cuando el precio va en contra → destruye la utilidad.
- **Ignorar grados:** mezclar escalas produce conteos imposibles.
- **Forzar el conteo:** no todo movimiento es una onda; preferir patrones comunes (zigzag) frente a raros.
- **No definir invalidación:** sin nivel donde el conteo "muere", el análisis es marketing, no trading.
- **Ignorar el marco mayor:** confundir un rebote correctivo con un impulso nuevo.
- **Overfitting de Fibonacci:** buscar el nivel que "explica" lo ya ocurrido.

### 1.5 Patrones correctivos
- **Zigzag (5-3-5):** corrección profunda y direccional.
- **Plana / Flat (3-3-5):** lateral; variantes regular, *expanded* (la más común), *running*.
- **Triángulo (3-3-3-3-3, A-B-C-D-E):** convergente/lateral; aparece en onda 4 o B.
- **Combinaciones (WXY / WXYXZ):** encadenan patrones simples por ondas X.
- **Diagonales (solapamiento 1-4 permitido):** *leading* (onda 1/A) y *ending* (onda 5/C, forma de cuña, anticipa reversión rápida).

### 1.6 Particularidades en cripto
- **Volatilidad amplificada** → patrones más "limpios" y pronunciados (precio dominado por sentimiento puro).
- **Mercado 24/7** → conteos intradía continuos, sin gaps de sesión.
- **Onda 3 extendida muy frecuente** (fases parabólicas tipo BTC 2024).
- **Retrocesos más profundos:** ondas 2 suelen ir a **0.786** (vs 0.618 en forex); correcciones mayores 0.786–0.886.
- **Dominio retail / manada** → encaja con la base psicológica de Elliott, pero aumenta la ambigüedad: **siempre mantener conteos alternativos**.

---

## 2. Detección algorítmica y cómo convertirlo en señales

### 2.1 Pipeline recomendado (5 etapas → escenarios ranqueados, nunca "el" conteo)

1. **Pivotes multi-grado** — reducir OHLC a picos/valles alternantes con **ZigZag adaptativo por ATR** (`k·ATR`, distinto `k` por grado) o `find_peaks(prominence=k·ATR, distance=min_bars)`. Usar pivotes **confirmados con lag** para evitar *repainting* en vivo.
2. **Enumerar candidatos con poda dura** — ventanas de 6 pivotes (impulso 1-5) y 4 pivotes (ABC); descartar de inmediato lo que viole las **3 reglas cardinales** (con tolerancia `τ·ATR`).
3. **Scoring suave** — Fibonacci como kernel gaussiano (tolerancia σ≈0.05–0.10), + bonus por alternancia, canalización, extensión de onda 3 y consistencia inter-grado. **Fibonacci nunca como filtro binario.**
4. **Ranking + diversidad** — top-3 escenarios deduplicados.
5. **Salida** — para cada escenario: etiquetas, score, **nivel de invalidación explícito** y objetivos Fibonacci proyectados.

```pseudo
for degree in [MACRO, MESO, MICRO]:
    pivots[degree] = zigzag_ATR(ohlc, k=K[degree])      # k ≈ {6, 3, 1.5}
candidates = []
for w in windows_of_6(pivots): if cardinal_rules(w, tol): candidates.add(impulse(w))
for w in windows_of_4(pivots): if abc_rules(w):           candidates.add(abc(w))
for c in candidates:
    c.score = w_fib*fib_score(c) + w_alt*alternation(c) + w_chan*channel(c)
            + w_ext*wave3_ext(c) + w_deg*intergrade(c)
    if c.last_pivot_unconfirmed: c.score *= 0.5           # anti-repaint
scenarios = topk(candidates, 3, dedupe=True)
emit(labels, score, invalidation_level, fib_targets)
```

### 2.2 Limitaciones de automatizar (honestidad)
- **No-unicidad:** la teoría admite múltiples conteos válidos a la vez. No existe "el correcto" en tiempo real, solo el más probable.
- **Dependencia del parámetro de sensibilidad:** el umbral θ/ATR *define* qué es una onda; no hay valor universal.
- **Repainting:** el último pivote se redibuja hasta confirmarse → riesgo de look-ahead en backtests.
- **Explosión combinatoria:** crece con el nº de pivotes y los grados.
- **Sin ground-truth:** los analistas humanos discrepan; el ML supervisado parte de etiquetas ruidosas.
- **Conclusión:** es un sistema de **hipótesis ranqueadas**, no un clasificador con verdad estable.

### 2.3 De análisis a señal útil (sin certezas)
- **Escenarios, no predicciones:** conteo **primario** + al menos uno **alternativo**, cada uno con su invalidación.
- **Invalidación previa y binaria:** el punto donde el conteo es estructuralmente imposible (define el stop).
- **Confluencia:** alineación multi-marco + zonas Fibonacci + divergencias de momentum + volumen.
- **Comunicar incertidumbre:** "más/menos probable" en vez de % falsos; **zonas, no precios exactos**; invalidación siempre visible; advertencias de riesgo explícitas.
- **Gestión de riesgo:** stop = invalidación estructural; R:R favorable (≥1:2); position sizing por riesgo fijo; sin apalancar en zonas ambiguas.

### 2.4 Indicadores complementarios de validación
| Indicador | Qué valida |
|---|---|
| **RSI** | RSI > 40 sostenido en onda 3; **divergencia bajista en onda 5** (precio sube, RSI baja) = fin de impulso; cruce de 50 al fin de corrección |
| **MACD / EWO (5/35)** | **Pico de momentum en onda 3**; divergencia en onda 5; cruce alcista al fin de corrección |
| **Volumen** | **Máximo en onda 3**, menor en onda 5, contracción en triángulos, expansión en rupturas |
| **Fibonacci** | Retrocesos (2: 0.5–0.618; 4: 0.236–0.382), extensiones (3: 1.618/2.618; 5: ≈1); **clusters/confluencias** elevan fiabilidad |
| **EMA 20/50/200** | Tendencia mayor (apilamiento); soporte dinámico; onda 4 suele terminar cerca de la EMA 50 |

**Score de confluencia (0–8 simple o 0–100 ponderado):** estructura de onda + Fibonacci pesan más que momentum. Lectura: 0–3 débil (no operar), 4–5 plausible, 6–8 alta fiabilidad. **Filtro duro:** cualquier violación de las 3 reglas cardinales anula el conteo sin importar el score.

---

## 3. APIs gratuitas recomendadas

### 3.1 Binance (fuente primaria) — verificado jun 2026
- **Dominio recomendado para frontend:** `https://data-api.binance.vision` (REST) y `wss://data-stream.binance.vision:443` (WS). **Solo market data pública, sin API key, sin geobloqueo documentado** (mejor que `api.binance.com`, que puede dar `451` por región).
- **Klines:** `GET /api/v3/klines?symbol=BTCUSDC&interval=1h&limit=1000` — peso **2**, máx **1000** velas/llamada, intervalos `1s…1M`. Para histórico largo, paginar con `startTime`/`endTime` (ms UTC).
- **Listar pares USDC:** `GET /api/v3/exchangeInfo` → filtrar `quoteAsset === "USDC"` y `status === "TRADING"`.
- **Stats 24h:** `GET /api/v3/ticker/24hr?symbol=BTCUSDC`.
- **Tiempo real (WS):** `wss://data-stream.binance.vision:443/ws/btcusdc@kline_1m`. El payload trae el flag **`x` (isClosed)** → clave para no repintar la vela en curso. Actualiza cada 2000 ms (1000 ms para `1s`).
- **Rate limit REST:** **6000 de REQUEST_WEIGHT/min por IP** (no 1200; subió en 2023-08-25). Vigilar header `X-MBX-USED-WEIGHT-1M`. `429` → respetar `Retry-After`; reincidir → `418` (ban IP).
- **CORS (importante):** el **REST de Binance NO devuelve `Access-Control-Allow-Origin`** → las llamadas `fetch` directas desde el navegador se **bloquean**. Necesitas un **proxy backend**. El **WebSocket NO está sujeto a CORS** → el stream de velas en vivo **sí se conecta directo desde el navegador**.

### 3.2 Complementos gratuitos
| API | Aporta | Free tier | Key | CORS |
|---|---|---|---|---|
| **CoinGecko** | Market cap, dominancia, metadatos | **100 req/min**, 10.000/mes | Demo key gratis (`x-cg-demo-api-key`) | Sí (directo) |
| **Alternative.me Fear & Greed** | Índice sentimiento 0–100 | ~60 req/min, sin key | No | Sí (directo) |
| **CryptoCompare** | OHLCV histórico, social | ~100k/mes | Key gratis | — |
| **Coinbase / Kraken** | Velas de respaldo | 10 req/s / ~1 req/s | No | — |

**Recomendación:** Binance klines (histórico) + Binance WS (tiempo real) + exchangeInfo (pares) + ticker24h, complementado con CoinGecko (market cap) y Fear&Greed (sentimiento).

---

## 4. Librerías de gráficos e indicadores

### 4.1 Gráfico financiero — recomendación: **KLineChart**
| Librería | npm | Licencia | Dibujo nativo | Indicadores nativos | Veredicto |
|---|---|---|---|---|---|
| **KLineChart** | `klinecharts` (v10-beta / v9 estable) | Apache-2.0 | **Sí**: `fibonacci`, `segment`, `priceLine`, canales + custom overlays | **Sí**: MACD, RSI, EMA/SMA, BOLL, VOL... | **✅ Recomendada MVP** (zero-deps, ~40KB) |
| **Lightweight Charts** | `lightweight-charts` (v5.2, mar 2025) | Apache-2.0 | No (solo price lines/markers; dibujo vía *primitives*) | No | Alternativa (mejor estética/rendimiento, más código custom) |
| Highcharts Stock | `highcharts/highstock` | Comercial | Sí | Sí | ❌ de pago comercial |
| AG Charts Financial | `ag-charts-enterprise` | Enterprise (pago) | Sí | — | ❌ de pago |
| ECharts | `echarts` | Apache-2.0 | Parcial (manual) | No | Posible pero más trabajo |
| Recharts | `recharts` | MIT | No | No | ❌ sin velas |
| TradingView Advanced | (no npm) | Restrictiva | Sí (todo) | Sí | ❌ no apto (licencia, prohíbe repos públicos/uso personal) |

**Por qué KLineChart para el MVP:** es la única opción 100% open source que trae **overlay nativo de Fibonacci** + **motor de indicadores** + API de dibujo (`registerOverlay` con `createPointFigures`) pensada para trazar **segmentos numerados 1-2-3-4-5 / A-B-C** con mucho menos código custom. Lightweight Charts es más bonita y rápida pero obliga a implementar todo el dibujo a mano sobre *primitives*.

### 4.2 Indicadores técnicos (si necesitas cálculo fuera del motor del chart)
- **`trading-signals`** (MIT) — TS-first, API **streaming** (`update()`/`getResult()`), activamente mantenida → **recomendada**.
- **`technicalindicators`** (MIT) — catálogo más amplio + patrones de velas, pero sin mantenimiento reciente (no formalmente *deprecated*); usar el fork `@thuantan2060/technicalindicators` si lo necesitas.

---

## 5. Arquitectura técnica propuesta

```
┌─────────────────────────── Frontend (Vite + React + TS) ──────────────────────────┐
│  UI: Tailwind CSS + shadcn/ui            Estado servidor: TanStack Query           │
│  Gráfico: KLineChart                     Estado UI: Zustand                        │
│                                                                                    │
│  ┌── WS directo ─────────────► wss://data-stream.binance.vision (velas live)       │
│  ├── fetch directo ──────────► CoinGecko / Fear&Greed (market cap, sentimiento)    │
│  └── fetch ──► [Proxy] ──────► data-api.binance.vision (klines, exchangeInfo, 24h) │
│                                                                                    │
│  Núcleo de análisis (Web Worker):                                                  │
│   pivotes(ZigZag/ATR) → reglas cardinales → scoring Fib/confluencia → escenarios   │
└────────────────────────────────────────────────────────────────────────────────────┘
         │
         ▼
┌─────────────── Backend proxy ligero (necesario por CORS de Binance REST) ───────────┐
│  Cloudflare Worker / Vercel Edge Function / Fastify mínimo                           │
│  - Reenvía a data-api.binance.vision   - Cachea respuestas (klines, exchangeInfo)    │
│  - Centraliza el rate-limit (una IP, vigila X-MBX-USED-WEIGHT-1M)                    │
└──────────────────────────────────────────────────────────────────────────────────────┘
```

**Decisiones clave:**
- **El análisis de Elliott corre en un Web Worker** para no bloquear el render del gráfico.
- **TanStack Query** gestiona caché, revalidación y estados de carga/error de los datos REST.
- **Backend proxy mínimo y stateless** (serverless) solo para el REST de Binance; todo lo demás va directo.
- **TypeScript estricto** y tipos de dominio compartidos (`Candle`, `Pivot`, `WaveCount`, `Scenario`).

**Estructura de carpetas sugerida:**
```
src/
  api/         binance.ts, coingecko.ts, sentiment.ts
  domain/      elliott/ (zigzag.ts, rules.ts, fibonacci.ts, scoring.ts, detector.ts)
               indicators/ (rsi.ts, macd.ts, ema.ts)
  worker/      analysis.worker.ts
  features/    chart/ (KLineChart wrapper, overlays Elliott + Fibonacci)
               pair-selector/  timeframe-selector/  analysis-panel/  scenarios/
  components/  ui/ (shadcn)
  store/       useChartStore.ts
  types/       candle.ts, wave.ts, scenario.ts
```

---

## 6. Plan de desarrollo por fases

**Fase 0 — Scaffolding (½–1 día):** Vite+React+TS, Tailwind+shadcn, ESLint/Prettier, proxy serverless, tipos de dominio.

**Fase 1 — Datos + gráfico (2–3 días):** selector de pares USDC (exchangeInfo), selector de temporalidad (15m/1h/4h/1d), klines históricos vía proxy, velas en KLineChart, WS en vivo con flag `x`, indicadores base (RSI, MACD, EMA, volumen).

**Fase 2 — Motor Elliott v1 (4–6 días):** ZigZag/ATR multi-grado, validación de las 3 reglas cardinales, scoring Fibonacci, detección de **impulso 5 ondas + zigzag ABC**, top-3 escenarios con invalidación y objetivos.

**Fase 3 — Visualización + narrativa (3–4 días):** dibujar ondas numeradas sobre las velas, niveles Fibonacci, **zona de invalidación**, panel de explicación textual por escenario, badge de probabilidad y score de confluencia, **disclaimers de riesgo**.

**Fase 4 — Refinado (continuo):** más patrones (flats, triángulos, diagonales), multi-marco, sentimiento/market cap, alertas, backtest honesto (tasa de invalidación, no "acierto del conteo").

---

## 7. Diseño funcional de la v1 (MVP)

**Pantalla única con 3 zonas:**
1. **Barra superior:** selector de par (BTC/ETH/SOL/BNB...USDC), selector de temporalidad (15m·1h·4h·1d), Fear&Greed + cambio 24h.
2. **Gráfico central (KLineChart):** velas + volumen + RSI/MACD opcionales; overlay de **ondas detectadas** (1-5/A-C numeradas), **niveles Fibonacci**, **zona de invalidación** sombreada, objetivos proyectados.
3. **Panel lateral de análisis:**
   - Escenario **primario** + **alternativo**, cada uno con: etiqueta (p.ej. "posible onda 3 impulsiva en desarrollo" / "posible corrección ABC"), **score de confluencia**, **nivel de invalidación**, **zonas de continuación/reversión**, explicación textual.
   - Indicadores de validación (RSI/MACD/volumen) con su lectura.
   - **Banner de riesgo permanente:** "Análisis probabilístico, no recomendación. El análisis técnico puede fallar."

**Reglas de producto:**
- Nunca "compra/vende ahora". Siempre "escenario probable / nivel donde se invalida / qué vigilar".
- Probabilidad cualitativa (más/menos probable) o score, **no** porcentajes falsos.
- Objetivos como **zonas**, no precios exactos.

---

## 8. Riesgos, limitaciones y puntos difíciles
- **Subjetividad irreducible de Elliott:** mitigar con top-N escenarios + invalidación explícita, nunca un único conteo.
- **Repainting del ZigZag:** usar pivotes confirmados con lag; marcar conteos provisionales.
- **Calibración del umbral (ATR/θ):** afecta todo; exponer multi-grado y, si acaso, control de sensibilidad.
- **Explosión combinatoria:** poda dura por reglas cardinales + límite de candidatos.
- **CORS de Binance REST:** obliga a backend proxy (ya contemplado).
- **Rate limits / geobloqueo:** usar `data-api.binance.vision`, cachear, vigilar weight.
- **Sin ground-truth para validar:** evaluar por tasa de invalidación y por si el precio alcanza el objetivo antes que la invalidación, no por "acierto".
- **Riesgo regulatorio/legal:** disclaimers claros; no es asesoramiento financiero; revisar términos de uso comercial de Binance/CoinGecko.

## 9. Recomendaciones para un MVP realista
- **Empezar minimal:** solo impulso de 5 ondas + zigzag ABC, en 1h y 4h, para 4–6 pares USDC líquidos. Añadir flats/triángulos/diagonales después.
- **Priorizar la honestidad sobre la "precisión":** la **invalidación** es lo más valioso y accionable; entrégala siempre.
- **KLineChart + Web Worker** para llegar rápido a algo dibujado y usable.
- **Proxy serverless cacheado** desde el día 1 (evita problemas de CORS y rate limit).
- **Backtest honesto** y métricas de calibración antes de añadir complejidad.
- **Disclaimers de riesgo** integrados en la UI, no en un footer escondido.

---

*Fuentes detalladas (Wikipedia, Elliott Wave International/Forecast, StockCharts, LuxAlgo, Babypips, papers IDT/MDPI/Springer, repos GitHub de detección Elliott, docs oficiales de Binance/CoinGecko/Alternative.me, GitHub de lightweight-charts y KLineChart) recopiladas durante la investigación multiagente del 2026-06-08.*
