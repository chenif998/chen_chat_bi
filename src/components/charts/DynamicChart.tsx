'use client';

import ReactECharts from 'echarts-for-react';
import type { EChartsOption } from 'echarts';

interface DynamicChartProps {
  option: EChartsOption | null;
}

export function DynamicChart({ option }: DynamicChartProps) {
  if (!option) {
    return (
      <div className="h-full w-full rounded-xl border border-zinc-200 bg-white p-4 text-sm text-zinc-500">
        当前查询更适合表格展示，暂无图表可视化。
      </div>
    );
  }

  return (
    <div className="h-full w-full rounded-xl bg-white">
      <ReactECharts option={option} style={{ height: '100%', width: '100%' }} />
    </div>
  );
}
