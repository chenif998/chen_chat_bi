import { randomUUID } from 'node:crypto';
import { NextResponse } from 'next/server';
import { generateQueryPlan } from '@/lib/ai/nl2sql';
import { generateInsights } from '@/lib/ai/insights';
import { buildChartOption } from '@/lib/charts/buildChartOption';
import { getDbClient } from '@/lib/db';
import { normalizeByDimensionAliases, normalizeOrgInQuestion } from '@/lib/models/valueMappings';
import {
  buildValueFilterHint,
  detectValueFilters,
  normalizeQuestionByValueAliases,
} from '@/lib/models/valueClassifier';
import {
  ensureSession,
  listRecentQuestions,
  saveMessage,
  touchSession,
} from '@/lib/chat/store';

const PROVINCE_ALIASES: Record<string, string> = {
  内蒙: '内蒙古',
  内蒙古自治区: '内蒙古',
};

const KNOWN_PROVINCES = [
  '河北',
  '山西',
  '内蒙古',
  '辽宁',
  '吉林',
  '黑龙江',
  '江苏',
  '浙江',
  '安徽',
  '福建',
  '江西',
  '山东',
  '河南',
  '湖北',
  '湖南',
  '广东',
  '广西',
  '海南',
  '重庆',
  '四川',
  '贵州',
  '云南',
  '西藏',
  '陕西',
  '甘肃',
  '青海',
  '宁夏',
  '新疆',
];

function isSafeSelectStatement(query: string) {
  const normalized = query.trim().replace(/\s+/g, ' ').toUpperCase();
  const isSingleSelect = normalized.startsWith('SELECT') && !normalized.includes(';');
  const forbidden = /(INSERT|UPDATE|DELETE|ALTER|DROP|TRUNCATE|CREATE|GRANT|REVOKE)\b/;
  return isSingleSelect && !forbidden.test(normalized);
}

function normalizeBusinessTerms(question: string) {
  let normalized = question.replace(/北分公司|北分/g, '北京分公司').replace(/南分公司|南分/g, '南京分公司');
  for (const [alias, canonical] of Object.entries(PROVINCE_ALIASES)) {
    normalized = normalized.replace(new RegExp(alias, 'g'), canonical);
  }
  return normalized;
}

function addProvinceComparisonHint(question: string) {
  const hasCompareIntent = /(比较|对比|差异|区别)/.test(question);
  if (!hasCompareIntent) return question;
  const matched = KNOWN_PROVINCES.filter((p) => question.includes(p));
  if (matched.length < 2) return question;
  return `${question}，请按省份(province)维度分别返回各省指标，不要只汇总到大区。`;
}

function extractWhereClause(sqlText: string) {
  const matched = sqlText.match(/where\s+([\s\S]*?)(?:group\s+by|order\s+by|limit|$)/i);
  if (!matched?.[1]) return '';
  return matched[1].trim().replace(/;$/, '');
}

function extractGroupByColumns(sqlText: string) {
  const matched = sqlText.match(/group\s+by\s+([\s\S]*?)(?:order\s+by|limit|$)/i);
  if (!matched?.[1]) return [];
  return matched[1]
    .split(',')
    .map((item) => item.trim().replace(/;$/, ''))
    .map((item) => item.replace(/"/g, ''))
    .map((item) => item.split('.').pop() || item)
    .filter(Boolean);
}

function shouldBuildFinanceSummary(question: string) {
  return /(利润|成本|销售额|销售|营收|毛利|利润率)/.test(question);
}

async function buildFinanceSummary(sqlText: string) {
  if (!/dw_sa_fact_saledetail_260422/i.test(sqlText)) {
    return null;
  }

  const whereClause = extractWhereClause(sqlText);
  const summarySql = `
    SELECT
      COALESCE(SUM(sales_amount), 0) AS total_sales,
      COALESCE(SUM(profit), 0) AS total_profit,
      COALESCE(SUM(sales_amount - profit), 0) AS total_cost,
      CASE
        WHEN COALESCE(SUM(sales_amount), 0) = 0 THEN 0
        ELSE COALESCE(SUM(profit), 0) / NULLIF(SUM(sales_amount), 0)
      END AS profit_rate
    FROM dw_sa_fact_saledetail_260422
    ${whereClause ? `WHERE ${whereClause}` : ''}
  `;

  const rows = await getDbClient().unsafe<Record<string, unknown>[]>(summarySql);
  return rows[0] || null;
}

async function buildFinanceBreakdown(sqlText: string) {
  if (!/dw_sa_fact_saledetail_260422/i.test(sqlText)) {
    return [];
  }

  const groupByColumns = extractGroupByColumns(sqlText);
  if (!groupByColumns.length) return [];

  const dimension = groupByColumns[0];
  const allowed = ['province', 'region', 'org_name', 'product_category', 'product_type', 'ship_mode', 'customer_type'];
  if (!allowed.includes(dimension)) return [];

  const whereClause = extractWhereClause(sqlText);
  const breakdownSql = `
    SELECT
      ${dimension} AS category,
      COALESCE(SUM(sales_amount), 0) AS total_sales,
      COALESCE(SUM(profit), 0) AS total_profit,
      COALESCE(SUM(sales_amount - profit), 0) AS total_cost,
      CASE
        WHEN COALESCE(SUM(sales_amount), 0) = 0 THEN 0
        ELSE COALESCE(SUM(profit), 0) / NULLIF(SUM(sales_amount), 0)
      END AS profit_rate
    FROM dw_sa_fact_saledetail_260422
    ${whereClause ? `WHERE ${whereClause}` : ''}
    GROUP BY ${dimension}
    ORDER BY ${dimension}
    LIMIT 20
  `;

  return getDbClient().unsafe<Record<string, unknown>[]>(breakdownSql);
}

export async function POST(request: Request) {
  try {
    const { question, sessionId } = await request.json();

    if (!question) {
      return NextResponse.json({ error: 'Question is required' }, { status: 400 });
    }

    const valueNormalized = await normalizeQuestionByValueAliases(String(question));
    const aliasedQuestion = await normalizeByDimensionAliases(valueNormalized);
    const businessNormalized = normalizeBusinessTerms(aliasedQuestion);
    const normalizedQuestion = addProvinceComparisonHint(
      await normalizeOrgInQuestion(businessNormalized),
    );
    const currentSessionId = typeof sessionId === 'string' && sessionId ? sessionId : randomUUID();
    await ensureSession(currentSessionId, normalizedQuestion);

    const contextQuestions = await listRecentQuestions(currentSessionId, 5);
    const valueFilters = await detectValueFilters(normalizedQuestion);
    const valueFilterHint = buildValueFilterHint(valueFilters);
    const queryPlan = await generateQueryPlan(normalizedQuestion, contextQuestions, valueFilterHint);
    if (!queryPlan.sql) {
      return NextResponse.json({ error: 'Failed to generate query plan' }, { status: 500 });
    }

    if (!isSafeSelectStatement(queryPlan.sql)) {
      return NextResponse.json({ error: 'Only SELECT queries are allowed' }, { status: 403 });
    }

    const rows = await getDbClient().unsafe<Record<string, unknown>[]>(queryPlan.sql);
    const chartOption = buildChartOption(rows, queryPlan.chartType, {
      question: normalizedQuestion,
      valueLabels: valueFilters.map((filter) => filter.value),
    });
    const insights = await generateInsights(normalizedQuestion, rows);
    const financeSummary = shouldBuildFinanceSummary(normalizedQuestion)
      ? await buildFinanceSummary(queryPlan.sql)
      : null;
    const financeBreakdown = shouldBuildFinanceSummary(normalizedQuestion)
      ? await buildFinanceBreakdown(queryPlan.sql)
      : [];
    const responsePayload = {
      sql: queryPlan.sql,
      chartType: queryPlan.chartType,
      chartReason: queryPlan.reason,
      chartOption,
      data: rows,
      insights,
      financeSummary,
      financeBreakdown,
    };

    await saveMessage(currentSessionId, 'user', normalizedQuestion);
    await saveMessage(
      currentSessionId,
      'assistant',
      `已完成分析：${queryPlan.reason}`,
      responsePayload as Record<string, unknown>,
    );
    await touchSession(currentSessionId);

    return NextResponse.json({
      sessionId: currentSessionId,
      ...responsePayload,
    });
  } catch (error: unknown) {
    console.error('API Error:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
