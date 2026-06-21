'use client';

import { FormEvent, type MouseEvent as ReactMouseEvent, useEffect, useRef, useState } from 'react';
import type { EChartsOption } from 'echarts';
import { DynamicChart } from '@/components/charts/DynamicChart';

interface InsightPayload {
  insights: string[];
  recommendations: string[];
}

type Row = Record<string, unknown>;

interface QueryResponse {
  chartOption: EChartsOption | null;
  chartType?: string;
  chartReason?: string;
  insights?: InsightPayload;
  data?: Row[];
  financeSummary?: {
    total_sales?: number | string;
    total_profit?: number | string;
    total_cost?: number | string;
    profit_rate?: number | string;
  } | null;
  financeBreakdown?: Array<{
    category?: string;
    total_sales?: number | string;
    total_profit?: number | string;
    total_cost?: number | string;
    profit_rate?: number | string;
  }>;
  error?: string;
}

interface ValueAliasItem {
  alias: string;
  table: string;
  column: string;
  value: string;
}

interface ChartCard {
  id: string;
  title: string;
  option: EChartsOption;
  chartType?: string;
  chartReason?: string;
  insights: InsightPayload;
  data: Row[];
  financeSummary?: {
    total_sales?: number | string;
    total_profit?: number | string;
    total_cost?: number | string;
    profit_rate?: number | string;
  } | null;
  financeBreakdown?: Array<{
    category?: string;
    total_sales?: number | string;
    total_profit?: number | string;
    total_cost?: number | string;
    profit_rate?: number | string;
  }>;
  x: number;
  y: number;
  width: number;
  height: number;
}

interface DragState {
  id: string;
  startX: number;
  startY: number;
  originX: number;
  originY: number;
}

interface ResizeState {
  id: string;
  startX: number;
  startY: number;
  originW: number;
  originH: number;
}

export default function Home() {
  const [question, setQuestion] = useState('');
  const [loading, setLoading] = useState(false);
  const [charts, setCharts] = useState<ChartCard[]>([]);
  const [selectedChartId, setSelectedChartId] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [valueAliases, setValueAliases] = useState<ValueAliasItem[]>([]);
  const [aliasLoading, setAliasLoading] = useState(false);
  const [aliasForm, setAliasForm] = useState<ValueAliasItem>({
    alias: '',
    table: 'dw_sa_fact_saledetail_260422',
    column: 'ship_mode',
    value: '',
  });
  const [regionFilter, setRegionFilter] = useState('全部');
  const [yearFilter, setYearFilter] = useState('全部');
  const [productFilter, setProductFilter] = useState('');
  const [orgFilter, setOrgFilter] = useState('');
  const [dragState, setDragState] = useState<DragState | null>(null);
  const [resizeState, setResizeState] = useState<ResizeState | null>(null);
  const boardRef = useRef<HTMLDivElement>(null);
  const queryFormRef = useRef<HTMLFormElement>(null);

  async function fetchAliases() {
    const res = await fetch('/api/value-aliases');
    const data = (await res.json()) as { aliases?: ValueAliasItem[] };
    return Array.isArray(data.aliases) ? data.aliases : [];
  }

  async function loadAliases() {
    setAliasLoading(true);
    try {
      const aliases = await fetchAliases();
      setValueAliases(aliases);
    } finally {
      setAliasLoading(false);
    }
  }

  useEffect(() => {
    void fetchAliases()
      .then((aliases) => {
        setValueAliases(aliases);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!dragState && !resizeState) return;

    function onMouseMove(event: globalThis.MouseEvent) {
      if (dragState) {
        const dx = event.clientX - dragState.startX;
        const dy = event.clientY - dragState.startY;
        setCharts((prev) =>
          prev.map((item) =>
            item.id === dragState.id
              ? { ...item, x: Math.max(0, dragState.originX + dx), y: Math.max(0, dragState.originY + dy) }
              : item,
          ),
        );
      }

      if (resizeState) {
        const dx = event.clientX - resizeState.startX;
        const dy = event.clientY - resizeState.startY;
        setCharts((prev) =>
          prev.map((item) =>
            item.id === resizeState.id
              ? {
                  ...item,
                  width: Math.max(320, resizeState.originW + dx),
                  height: Math.max(260, resizeState.originH + dy),
                }
              : item,
          ),
        );
      }
    }

    function onMouseUp() {
      setDragState(null);
      setResizeState(null);
    }

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
    return () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };
  }, [dragState, resizeState]);

  function getCardById(id: string) {
    return charts.find((item) => item.id === id);
  }

  const selectedChart = selectedChartId ? getCardById(selectedChartId) : null;

  function toNumber(value: unknown) {
    if (typeof value === 'number') return value;
    if (typeof value === 'string') {
      const n = Number(value.replace(/,/g, '').trim());
      return Number.isFinite(n) ? n : 0;
    }
    return 0;
  }

  function detectMetricColumn(rows: Row[], candidates: string[]) {
    if (!rows.length) return '';
    const keys = Object.keys(rows[0]);
    for (const candidate of candidates) {
      const found = keys.find((k) => k.toLowerCase() === candidate.toLowerCase());
      if (found) return found;
    }
    return '';
  }

  function computeKpis(rows: Row[]) {
    if (!rows.length) {
      return { sales: 0, profit: 0, cost: 0, margin: 0 };
    }

    const salesKey = detectMetricColumn(rows, ['sales_amount', 'total_sales', 'sales', 'income']);
    const profitKey = detectMetricColumn(rows, ['profit', 'total_profit']);
    const costKey = detectMetricColumn(rows, ['cost_amount', 'total_cost', 'cost']);

    const sales = salesKey ? rows.reduce((sum, row) => sum + toNumber(row[salesKey]), 0) : 0;
    const profit = profitKey ? rows.reduce((sum, row) => sum + toNumber(row[profitKey]), 0) : 0;
    const cost = costKey ? rows.reduce((sum, row) => sum + toNumber(row[costKey]), 0) : Math.max(sales - profit, 0);
    const margin = sales > 0 ? profit / sales : 0;

    return { sales, profit, cost, margin };
  }

  function computeKpisFromSummary(summary?: ChartCard['financeSummary']) {
    if (!summary) return null;
    const sales = toNumber(summary.total_sales);
    const profit = toNumber(summary.total_profit);
    const cost = toNumber(summary.total_cost);
    const margin = toNumber(summary.profit_rate);
    return { sales, profit, cost, margin };
  }

  function formatWan(value: number) {
    return `${(value / 10000).toFixed(2)} 万`;
  }

  function buildQuestionWithFilters(rawQuestion: string) {
    const parts: string[] = [rawQuestion.trim()];
    if (regionFilter !== '全部') parts.push(`仅看${regionFilter}`);
    if (yearFilter !== '全部') parts.push(`年份为${yearFilter}`);
    if (productFilter.trim()) parts.push(`产品包含${productFilter.trim()}`);
    if (orgFilter.trim()) parts.push(`组织为${orgFilter.trim()}`);
    return parts.filter(Boolean).join('，');
  }

  function startDrag(event: ReactMouseEvent, id: string) {
    event.preventDefault();
    const card = getCardById(id);
    if (!card) return;
    setResizeState(null);
    setDragState({
      id,
      startX: event.clientX,
      startY: event.clientY,
      originX: card.x,
      originY: card.y,
    });
  }

  function startResize(event: ReactMouseEvent, id: string) {
    event.preventDefault();
    event.stopPropagation();
    const card = getCardById(id);
    if (!card) return;
    setDragState(null);
    setResizeState({
      id,
      startX: event.clientX,
      startY: event.clientY,
      originW: card.width,
      originH: card.height,
    });
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError('');

    try {
      const composedQuestion = buildQuestionWithFilters(question);
      const res = await fetch('/api/query', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: composedQuestion }),
      });

      const data = (await res.json()) as QueryResponse;
      if (!res.ok) {
        throw new Error(data.error || '请求失败');
      }
      if (!data.chartOption) {
        throw new Error('当前查询暂无可视化图表，请换一个带数值聚合的问题。');
      }

      const chartCount = charts.length;
      const cardWidth = 460;
      const cardHeight = 320;
      const columns = 2;
      const gap = 20;
      const nextX = (chartCount % columns) * (cardWidth + gap) + 16;
      const nextY = Math.floor(chartCount / columns) * (cardHeight + gap) + 16;

      const newId = `${Date.now()}-${charts.length}`;
      setCharts((prev) => [
        ...prev,
        {
          id: newId,
          title: question.trim() || `图表 ${prev.length + 1}`,
          option: data.chartOption as EChartsOption,
          chartType: data.chartType,
          chartReason: data.chartReason,
          insights: {
            insights: data.insights?.insights || ['当前问题已生成图表，可进一步提问获取更深分析。'],
            recommendations:
              data.insights?.recommendations || ['建议继续按时间、组织、产品维度做下钻分析。'],
          },
          data: data.data || [],
          financeSummary: data.financeSummary || null,
          financeBreakdown: data.financeBreakdown || [],
          x: nextX,
          y: nextY,
          width: cardWidth,
          height: cardHeight,
        },
      ]);
      setSelectedChartId(newId);
      setError('');
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : '未知错误';
      setError(message);
    } finally {
      setLoading(false);
    }
  }

  function onUploadClick() {
    if (!fileInputRef.current) return;
    fileInputRef.current.value = '';
    fileInputRef.current.click();
  }

  async function onFileChange(file: File | null) {
    if (!file) {
      return;
    }
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', file);

      const res = await fetch('/api/upload-table', {
        method: 'POST',
        body: formData,
      });
      const data = (await res.json()) as {
        ok?: boolean;
        error?: string;
        tableName?: string;
        rowCount?: number;
        modelAlias?: string;
        suggestedQuestion?: string;
      };
      if (!res.ok) {
        throw new Error(data.error || '上传失败');
      }
      if (data.suggestedQuestion) {
        setQuestion(data.suggestedQuestion);
      }
      window.alert(`上传成功：${data.tableName}，共 ${data.rowCount} 行`);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : '上传失败';
      window.alert(message);
    } finally {
      setUploading(false);
    }
  }

  async function saveAlias() {
    if (!aliasForm.alias.trim() || !aliasForm.value.trim()) {
      window.alert('请填写别名和值');
      return;
    }
    const res = await fetch('/api/value-aliases', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(aliasForm),
    });
    const data = (await res.json()) as { aliases?: ValueAliasItem[]; error?: string };
    if (!res.ok) {
      window.alert(data.error || '保存失败');
      return;
    }
    setValueAliases(data.aliases || []);
    setAliasForm((prev) => ({ ...prev, alias: '', value: '' }));
  }

  async function removeAlias(alias: string) {
    const res = await fetch('/api/value-aliases', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ alias }),
    });
    const data = (await res.json()) as { aliases?: ValueAliasItem[]; error?: string };
    if (!res.ok) {
      window.alert(data.error || '删除失败');
      return;
    }
    setValueAliases(data.aliases || []);
  }

  return (
    <main className="min-h-screen bg-slate-100 px-4 py-6 text-zinc-900">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-4">
        <section className="rounded-2xl border border-sky-100 bg-gradient-to-r from-sky-100 via-cyan-50 to-blue-100 p-6 shadow-sm">
          <h1 className="text-3xl font-bold tracking-tight text-sky-900">CHAT BI数据查询</h1>

          <div className="mt-4 grid gap-2 rounded-xl border border-sky-200 bg-white/70 p-3 md:grid-cols-[1fr_1fr_1fr_1fr_auto]">
            <select
              value={regionFilter}
              onChange={(e) => setRegionFilter(e.target.value)}
              className="rounded-md border border-zinc-300 bg-white px-2 py-1.5 text-sm"
            >
              <option>全部</option>
              <option>华东区</option>
              <option>华南区</option>
              <option>东北区</option>
              <option>华北区</option>
              <option>西南区</option>
              <option>西北区</option>
            </select>
            <select
              value={yearFilter}
              onChange={(e) => setYearFilter(e.target.value)}
              className="rounded-md border border-zinc-300 bg-white px-2 py-1.5 text-sm"
            >
              <option>全部</option>
              <option>2016</option>
              <option>2017</option>
              <option>2018</option>
              <option>2019</option>
            </select>
            <input
              value={productFilter}
              onChange={(e) => setProductFilter(e.target.value)}
              placeholder="产品关键词"
              className="rounded-md border border-zinc-300 bg-white px-2 py-1.5 text-sm"
            />
            <input
              value={orgFilter}
              onChange={(e) => setOrgFilter(e.target.value)}
              placeholder="组织关键词"
              className="rounded-md border border-zinc-300 bg-white px-2 py-1.5 text-sm"
            />
            <button
              type="button"
              onClick={() => queryFormRef.current?.requestSubmit()}
              disabled={loading}
              className="rounded-md bg-sky-700 px-3 py-1.5 text-sm text-white hover:bg-sky-600 disabled:opacity-60"
            >
              {loading ? '查询中...' : '查询'}
            </button>
          </div>

          <details className="mt-3 rounded-xl border border-sky-200 bg-white/70 p-3">
            <summary className="cursor-pointer text-sm font-medium text-sky-900">
              值映射配置（示例：JD -&gt; 京东）
            </summary>
            <div className="mt-2 flex justify-end">
              <button
                type="button"
                onClick={loadAliases}
                className="rounded-md bg-sky-700 px-3 py-1.5 text-xs text-white hover:bg-sky-600 disabled:opacity-60"
                disabled={aliasLoading}
              >
                {aliasLoading ? '查询中...' : '查询'}
              </button>
            </div>
            <div className="mt-3 grid gap-2 md:grid-cols-4">
              <input
                value={aliasForm.alias}
                onChange={(e) => setAliasForm((prev) => ({ ...prev, alias: e.target.value }))}
                placeholder="别名，例如 jd"
                className="rounded-md border border-zinc-300 bg-white px-2 py-1.5 text-sm"
              />
              <input
                value={aliasForm.column}
                onChange={(e) => setAliasForm((prev) => ({ ...prev, column: e.target.value }))}
                placeholder="字段，例如 ship_mode"
                className="rounded-md border border-zinc-300 bg-white px-2 py-1.5 text-sm"
              />
              <input
                value={aliasForm.value}
                onChange={(e) => setAliasForm((prev) => ({ ...prev, value: e.target.value }))}
                placeholder="值，例如 京东"
                className="rounded-md border border-zinc-300 bg-white px-2 py-1.5 text-sm"
              />
              <button
                type="button"
                onClick={saveAlias}
                className="rounded-md bg-sky-700 px-3 py-1.5 text-sm text-white hover:bg-sky-600"
              >
                保存映射
              </button>
            </div>
            <div className="mt-3 max-h-32 space-y-1 overflow-y-auto rounded-md border border-zinc-200 bg-white p-2 text-xs">
              {valueAliases.length ? (
                valueAliases.map((item) => (
                  <div key={`${item.alias}-${item.column}`} className="flex items-center justify-between">
                    <span>
                      {item.alias}
                      {' => '}
                      {item.table}.{item.column} = {item.value}
                    </span>
                    <button
                      type="button"
                      onClick={() => removeAlias(item.alias)}
                      className="rounded bg-rose-600 px-2 py-0.5 text-white"
                    >
                      删除
                    </button>
                  </div>
                ))
              ) : (
                <p className="text-zinc-500">暂无自定义映射</p>
              )}
            </div>
          </details>

          <form ref={queryFormRef} onSubmit={onSubmit} className="mt-4 flex flex-col gap-3">
            <textarea
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              placeholder="输入查询问题（例如：山西内蒙利润比较）"
              className="min-h-24 rounded-xl border border-sky-200 bg-white/80 p-3 text-sm outline-none ring-blue-500 focus:ring"
            />
            <div className="flex gap-2">
              <button
                type="submit"
                disabled={loading}
                className="rounded-lg bg-sky-800 px-4 py-2 text-sm font-medium text-white transition hover:bg-sky-700 disabled:opacity-60"
              >
                {loading ? '分析中...' : '发送问题'}
              </button>
              <button
                type="button"
                onClick={onUploadClick}
                disabled={uploading}
                className="rounded-lg bg-sky-700 px-4 py-2 text-sm font-medium text-white transition hover:bg-sky-600 disabled:opacity-60"
              >
                {uploading ? '上传中...' : '上传表格'}
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv,.xlsx,.xls"
                onChange={(e) => onFileChange(e.target.files?.[0] || null)}
                className="hidden"
              />
            </div>
          </form>
          {error ? <p className="mt-3 text-sm text-red-600">{error}</p> : null}
        </section>

        {selectedChart ? (
          <section className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-semibold text-zinc-800">智能分析建议</h2>
              <span className="rounded bg-sky-50 px-2 py-1 text-xs text-sky-700">
                {selectedChart.chartType || 'chart'}
              </span>
            </div>
            <p className="mt-2 text-sm text-zinc-600">{selectedChart.chartReason || '已基于当前问题生成图表分析。'}</p>

            <div className="mt-4 grid gap-4 md:grid-cols-2">
              <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-3">
                <p className="mb-2 text-sm font-medium text-zinc-700">关键洞察</p>
                <ul className="space-y-1 text-sm text-zinc-600">
                  {selectedChart.insights.insights.map((item) => (
                    <li key={item}>- {item}</li>
                  ))}
                </ul>
              </div>
              <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-3">
                <p className="mb-2 text-sm font-medium text-zinc-700">建议动作</p>
                <ul className="space-y-1 text-sm text-zinc-600">
                  {selectedChart.insights.recommendations.map((item) => (
                    <li key={item}>- {item}</li>
                  ))}
                </ul>
              </div>
            </div>
          </section>
        ) : null}

        {selectedChart ? (
          <section className="grid gap-3 md:grid-cols-4">
            {(() => {
              const breakdown = selectedChart.financeBreakdown || [];
              const hasCategoryBreakdown = breakdown.length >= 2;
              const summaryKpi = computeKpisFromSummary(selectedChart.financeSummary);
              const k = summaryKpi || computeKpis(selectedChart.data);
              const renderBreakdown = (
                metric: 'total_sales' | 'total_profit' | 'total_cost' | 'profit_rate',
              ) => (
                <div className="mt-1 space-y-1 text-xs text-zinc-600">
                  {breakdown.map((item, idx) => {
                    const label = String(item.category || `分类${idx + 1}`);
                    const num = toNumber(item[metric]);
                    const valueText =
                      metric === 'profit_rate' ? `${(num * 100).toFixed(2)}%` : formatWan(num);
                    return (
                      <p key={`${metric}-${label}`} className="truncate">
                        {label}: {valueText}
                      </p>
                    );
                  })}
                </div>
              );
              return (
                <>
                  <div className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm">
                    <p className="text-xs text-zinc-500">销售额</p>
                    {hasCategoryBreakdown ? (
                      renderBreakdown('total_sales')
                    ) : (
                      <p className="mt-1 text-xl font-semibold text-zinc-800">{formatWan(k.sales)}</p>
                    )}
                  </div>
                  <div className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm">
                    <p className="text-xs text-zinc-500">利润</p>
                    {hasCategoryBreakdown ? (
                      renderBreakdown('total_profit')
                    ) : (
                      <p className="mt-1 text-xl font-semibold text-emerald-700">{formatWan(k.profit)}</p>
                    )}
                  </div>
                  <div className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm">
                    <p className="text-xs text-zinc-500">成本</p>
                    {hasCategoryBreakdown ? (
                      renderBreakdown('total_cost')
                    ) : (
                      <p className="mt-1 text-xl font-semibold text-amber-700">{formatWan(k.cost)}</p>
                    )}
                  </div>
                  <div className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm">
                    <p className="text-xs text-zinc-500">利润率</p>
                    {hasCategoryBreakdown ? (
                      renderBreakdown('profit_rate')
                    ) : (
                      <p className="mt-1 text-xl font-semibold text-sky-700">{(k.margin * 100).toFixed(2)}%</p>
                    )}
                  </div>
                </>
              );
            })()}
          </section>
        ) : null}

        <section className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
          <div
            ref={boardRef}
            className="relative min-h-[620px] rounded-xl bg-[radial-gradient(circle_at_1px_1px,#e2e8f0_1px,transparent_0)] [background-size:18px_18px]"
          >
            {charts.map((chart) => (
              <div
                key={chart.id}
                className={`group absolute rounded-xl border bg-white/80 p-2 shadow-sm transition hover:border-sky-300 hover:shadow-md ${
                  selectedChartId === chart.id ? 'border-sky-300 shadow-md' : 'border-transparent'
                }`}
                style={{
                  left: chart.x,
                  top: chart.y,
                  width: chart.width,
                  height: chart.height,
                }}
                onMouseDown={() => setSelectedChartId(chart.id)}
              >
                <div className="mb-2 flex items-center justify-between">
                  <div className="min-w-0 pr-2">
                    <p className="truncate text-xs font-medium text-zinc-700">{chart.title}</p>
                    <p className="truncate text-[10px] text-zinc-500">{chart.chartReason || '智能图表'}</p>
                  </div>
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onMouseDown={(event) => startDrag(event, chart.id)}
                      className="rounded bg-sky-700 px-2 py-1 text-[10px] text-white opacity-0 transition group-hover:opacity-100"
                    >
                      拖动
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        setCharts((prev) => {
                          const next = prev.filter((item) => item.id !== chart.id);
                          if (selectedChartId === chart.id) {
                            setSelectedChartId(next[0]?.id || null);
                          }
                          return next;
                        })
                      }
                      className="rounded bg-rose-600 px-2 py-1 text-[10px] text-white opacity-0 transition group-hover:opacity-100 hover:bg-rose-500"
                    >
                      删除
                    </button>
                  </div>
                </div>
                <div className="h-[calc(100%-34px)] w-full">
                  <DynamicChart option={chart.option} />
                </div>
                <button
                  type="button"
                  onMouseDown={(event) => startResize(event, chart.id)}
                  className="absolute bottom-1 right-1 h-4 w-4 cursor-se-resize rounded-sm border border-sky-400 bg-sky-100 opacity-0 transition group-hover:opacity-100"
                  aria-label="调整大小"
                />
              </div>
            ))}
            {!charts.length ? (
              <div className="flex h-[620px] items-center justify-center text-sm text-zinc-400">
                暂无图表，发送问题后会在这里新增可视化卡片。
              </div>
            ) : null}
          </div>
        </section>
      </div>
    </main>
  );
}
