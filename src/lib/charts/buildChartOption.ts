import type { EChartsOption } from 'echarts';
import type { ChartType } from '@/lib/ai/types';

type Row = Record<string, unknown>;

interface ChartBuildContext {
  question?: string;
  valueLabels?: string[];
}

const TRAILING_METRIC_PATTERN =
  /(利润(?:率)?|销售额|销售金额|销售|营收|收入|成本|毛利|数量|金额|合计|总计|统计|查询|分析|多少|是什么|怎么样|比较|对比|分别|各个|各|的)$/;

function extractCategoryLabelFromQuestion(question: string) {
  let label = question.trim().replace(/[？?！!。，,、；;：:\s]+$/g, '');
  while (TRAILING_METRIC_PATTERN.test(label)) {
    label = label.replace(TRAILING_METRIC_PATTERN, '').trim();
  }
  return label;
}

function resolveCategoryLabels(rows: Row[], context?: ChartBuildContext) {
  const fromQuestion = context?.question ? extractCategoryLabelFromQuestion(context.question) : '';
  const fromValues = context?.valueLabels?.filter(Boolean).join('') || '';
  const baseLabel = fromQuestion || fromValues || '查询结果';

  if (rows.length <= 1) {
    return [baseLabel];
  }

  return rows.map((_, idx) => (idx === 0 ? baseLabel : `${baseLabel} ${idx + 1}`));
}

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

export function buildChartOption(
  rows: Row[],
  chartType: ChartType,
  context?: ChartBuildContext,
): EChartsOption | null {
  if (!rows.length) {
    return null;
  }

  const hasNumericField = Object.values(rows[0]).some((value) => isNumericLike(value));
  if (!hasNumericField) {
    return null;
  }

  const { xKey, yKey } = detectDimensions(rows);
  if (!xKey || !yKey) return null;

  const useQuestionLabels = xKey === yKey;
  const categoryLabels = useQuestionLabels ? resolveCategoryLabels(rows, context) : [];
  const xData = useQuestionLabels
    ? categoryLabels
    : rows.map((r) => toLabel(r[xKey]));
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
          data: rows.map((r, idx) => ({
            name: useQuestionLabels ? categoryLabels[idx] || toLabel(r[xKey]) : toLabel(r[xKey]),
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
