export type ChartType = 'bar' | 'line' | 'pie' | 'scatter' | 'table';

export interface QueryPlan {
  sql: string;
  chartType: ChartType;
  reason: string;
}
