/** Estilos oscuros para KLineChart, coherentes con la paleta de la app. */
export const darkChartStyles = {
  grid: {
    horizontal: { color: '#1e293b' },
    vertical: { color: '#1e293b' },
  },
  candle: {
    bar: {
      upColor: '#22c55e',
      downColor: '#ef4444',
      noChangeColor: '#94a3b8',
      upBorderColor: '#22c55e',
      downBorderColor: '#ef4444',
      upWickColor: '#22c55e',
      downWickColor: '#ef4444',
    },
    priceMark: {
      high: { color: '#94a3b8' },
      low: { color: '#94a3b8' },
      last: {
        upColor: '#22c55e',
        downColor: '#ef4444',
        noChangeColor: '#94a3b8',
        line: { show: true },
        text: { color: '#0b1220' },
      },
    },
    tooltip: {
      text: { color: '#e2e8f0' },
    },
  },
  xAxis: {
    axisLine: { color: '#334155' },
    tickLine: { color: '#334155' },
    tickText: { color: '#94a3b8' },
  },
  yAxis: {
    axisLine: { color: '#334155' },
    tickLine: { color: '#334155' },
    tickText: { color: '#94a3b8' },
  },
  crosshair: {
    horizontal: {
      line: { color: '#64748b' },
      text: { backgroundColor: '#334155', color: '#e2e8f0' },
    },
    vertical: {
      line: { color: '#64748b' },
      text: { backgroundColor: '#334155', color: '#e2e8f0' },
    },
  },
  indicator: {
    tooltip: { text: { color: '#e2e8f0' } },
  },
}
