import type { EChartsOption } from 'echarts';
import type { ChartType } from '@/lib/ai/types';

type Row = Record<string, unknown>;

interface ChartBuildContext {
  question?: string;
  valueLabels?: string[];
}

interface DimensionDetection {
  xKey: string;
  yKey: string;
  useQuestionLabels: boolean;
}

const TRAILING_METRIC_PATTERN =
  /(利润(?:率)?|销售额|销售金额|销售|营收|收入|成本|毛利|数量|金额|合计|总计|统计|查询|分析|多少|是什么|怎么样|比较|对比|分别|各个|各|的)$/;

const METRIC_COLUMN_PATTERN =
  /(amount|sales|profit|cost|qty|quantity|total|count|num|rate|margin|revenue|income|sum|avg)/i;

const METRIC_HINTS: Array<{ pattern: RegExp; columns: string[] }> = [
  { pattern: /利润|profit/i, columns: ['profit', 'total_profit', 'sum_profit'] },
  { pattern: /销售|营收|金额|sales|amount|gmv/i, columns: ['sales_amount', 'total_sales', 'sales', 'amount'] },
  { pattern: /成本|cost/i, columns: ['cost_amount', 'total_cost', 'cost'] },
  { pattern: /数量|quantity|qty/i, columns: ['quantity', 'qty', 'count'] },
];

function extractCategoryLabelFromQuestion(question: string) {
  let label = question.trim();
  label = label
    .replace(/，仅看[^，]*/g, '')
    .replace(/，年份为[^，]*/g, '')
    .replace(/，产品包含[^，]*/g, '')
    .replace(/，组织为[^，]*/g, '')
    .replace(/[？?！!。，,、；;：:\s]+$/g, '');

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

function isMetricColumn(name: string) {
  return METRIC_COLUMN_PATTERN.test(name);
}

function isYearLikeValue(value: unknown) {
  if (!isNumericLike(value)) return false;
  const n = toNumber(value);
  return Number.isInteger(n) && n >= 1900 && n <= 2100;
}

function isTrueDimensionColumn(rows: Row[], key: string) {
  if (isMetricColumn(key)) return false;

  const values = rows.map((row) => row[key]);
  if (values.every((value) => isNumericLike(value) && !isYearLikeValue(value))) {
    return false;
  }

  return true;
}

function pickMetricKey(rows: Row[], question?: string) {
  const keys = Object.keys(rows[0]).filter((key) => isNumericLike(rows[0][key]));
  if (!keys.length) return '';

  const normalizedQuestion = question || '';
  for (const hint of METRIC_HINTS) {
    if (!hint.pattern.test(normalizedQuestion)) continue;
    const matched = keys.find((key) =>
      hint.columns.some(
        (candidate) => key.toLowerCase() === candidate || key.toLowerCase().includes(candidate),
      ),
    );
    if (matched) return matched;
  }

  return keys.find((key) => isMetricColumn(key)) || keys[0];
}

function detectDimensions(rows: Row[], question?: string): DimensionDetection {
  if (!rows.length) {
    return { xKey: '', yKey: '', useQuestionLabels: false };
  }

  const keys = Object.keys(rows[0]);
  const dimensionKeys = keys.filter((key) => isTrueDimensionColumn(rows, key));
  const numericKeys = keys.filter((key) => isNumericLike(rows[0][key]));

  if (dimensionKeys.length > 0) {
    const xKey = dimensionKeys[0];
    const yKey = numericKeys.find((key) => key !== xKey) || pickMetricKey(rows, question) || numericKeys[0] || '';
    const xValuesAreNumeric = rows.every((row) => isNumericLike(row[xKey]) && !isYearLikeValue(row[xKey]));
    return {
      xKey,
      yKey,
      useQuestionLabels: xValuesAreNumeric,
    };
  }

  const yKey = pickMetricKey(rows, question) || numericKeys[0] || keys[0];
  return {
    xKey: yKey,
    yKey,
    useQuestionLabels: true,
  };
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

  const { xKey, yKey, useQuestionLabels } = detectDimensions(rows, context?.question);
  if (!xKey || !yKey) return null;

  const categoryLabels = useQuestionLabels ? resolveCategoryLabels(rows, context) : [];
  const xData = useQuestionLabels ? categoryLabels : rows.map((row) => toLabel(row[xKey]));
  const yData = rows.map((row) => toNumber(row[yKey]));

  const effectiveType: ChartType = chartType === 'table' ? 'bar' : chartType;

  if (effectiveType === 'pie') {
    return {
      tooltip: { trigger: 'item' },
      legend: { top: 'bottom' },
      series: [
        {
          type: 'pie',
          radius: '65%',
          data: rows.map((row, idx) => ({
            name: useQuestionLabels ? categoryLabels[idx] || toLabel(row[xKey]) : toLabel(row[xKey]),
            value: toNumber(row[yKey]),
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
