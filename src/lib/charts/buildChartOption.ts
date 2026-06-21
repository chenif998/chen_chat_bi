import type { EChartsOption } from 'echarts';
import type { ChartType } from '@/lib/ai/types';

type Row = Record<string, unknown>;

function toLabel(value: unknown) {
  if (value === null || value === undefined) return '-';
  return String(value);
}

function toNumber(value: unknown) {
  if (typeof value === 'number') return value;
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function isNumericLike(value: unknown) {
  if (typeof value === 'number') return true;
  if (typeof value === 'string') {
    const n = Number(value.replace(/,/g, '').trim());
    return Number.isFinite(n);
  }
  return false;
}

function detectDimensions(rows: Row[]) {
  if (!rows.length) return { xKey: '', yKey: '' };
  const keys = Object.keys(rows[0]);
  const numericKeys = keys.filter((k) => isNumericLike(rows[0][k]));
  const nonNumericKeys = keys.filter((k) => !isNumericLike(rows[0][k]));
  let xKey = nonNumericKeys[0] || '';
  let yKey = numericKeys[0] || '';

  // If no explicit dimension exists, use the first column as x-axis fallback.
  if (!xKey) {
    xKey = keys.find((k) => k !== yKey) || keys[0] || '';
  }
  if (!yKey) {
    yKey = keys.find((k) => k !== xKey) || keys[0] || '';
  }

  return { xKey, yKey };
}

export function buildChartOption(rows: Row[], chartType: ChartType): EChartsOption | null {
  if (!rows.length) {
    return null;
  }

  const hasNumericField = Object.values(rows[0]).some((value) => isNumericLike(value));
  if (!hasNumericField) {
    return null;
  }

  const { xKey, yKey } = detectDimensions(rows);
  if (!xKey || !yKey) return null;

  const xData = xKey === yKey ? rows.map((_, idx) => `Item ${idx + 1}`) : rows.map((r) => toLabel(r[xKey]));
  const yData = rows.map((r) => toNumber(r[yKey]));

  const effectiveType: ChartType = chartType === 'table' ? 'bar' : chartType;

  if (effectiveType === 'pie') {
    return {
      tooltip: { trigger: 'item' },
      legend: { top: 'bottom' },
      series: [
        {
          type: 'pie',
          radius: '65%',
          data: rows.map((r) => ({
            name: toLabel(r[xKey]),
            value: toNumber(r[yKey]),
          })),
        },
      ],
    };
  }

  if (effectiveType === 'scatter') {
    return {
      tooltip: { trigger: 'item' },
      xAxis: { type: 'category', data: xData, axisLabel: { rotate: 30 } },
      yAxis: { type: 'value' },
      series: [{ type: 'scatter', data: yData }],
    };
  }

  return {
    tooltip: { trigger: 'axis' },
    xAxis: { type: 'category', data: xData, axisLabel: { rotate: 30 } },
    yAxis: { type: 'value' },
    series: [
      {
        type: effectiveType === 'line' ? 'line' : 'bar',
        data: yData,
        smooth: effectiveType === 'line',
      },
    ],
  };
}
