import { describe, it, expect, vi, afterEach } from 'vitest'
import { fetchKlines } from '@/api/binance'

afterEach(() => vi.unstubAllGlobals())

describe('fetchKlines — mapeo de campos', () => {
  it('mapea el volumen de compra agresora (k[9]) a takerBuyVolume', async () => {
    // Tupla Binance: [openTime, o, h, l, c, volume, closeTime, quoteVol, numTrades,
    //                 takerBuyBase(9), takerBuyQuote(10), ignore]
    const raw = [
      [1000, '10', '12', '9', '11', '100', 2000, '1100', 50, '70', '770', '0'],
      [2000, '11', '13', '10', '12', '200', 999999999999, '2400', 60, '120', '1440', '0'],
    ]
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: true, json: async () => raw })),
    )

    const candles = await fetchKlines('BTCUSDC', '1h', 2)
    expect(candles).toHaveLength(2)
    expect(candles[0].volume).toBe(100)
    expect(candles[0].takerBuyVolume).toBe(70)
    expect(candles[1].takerBuyVolume).toBe(120)
    // Delta de flujo real de la primera vela: 2·70 − 100 = +40 (compra domina).
    expect(2 * candles[0].takerBuyVolume! - candles[0].volume).toBe(40)
  })
})
