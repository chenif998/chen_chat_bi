import { NextResponse } from 'next/server';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { parse } from 'csv-parse/sync';
import * as XLSX from 'xlsx';
import { getDbClient } from '@/lib/db';

type Row = Record<string, unknown>;
type FieldType = 'dimension' | 'measure';
type FieldCategory =
  | 'time'
  | 'organization'
  | 'geography'
  | 'product'
  | 'customer'
  | 'finance'
  | 'quantity'
  | 'identifier'
  | 'other';

const HEADER_MAP: Record<string, string> = {
  订单日期: 'order_date',
  订单年: 'order_year',
  订单年月: 'order_year_month',
  邮寄方式: 'ship_mode',
  产品编码: 'product_code',
  产品名称: 'product_name',
  产品类型: 'product_type',
  产品大类: 'product_category',
  客户编码: 'customer_code',
  客户名称: 'customer_name',
  客户类型: 'customer_type',
  大区: 'region',
  省份: 'province',
  城市简称: 'city_short',
  销售金额: 'sales_amount',
  利润: 'profit',
  数量: 'quantity',
  审核日期: 'review_date',
  组织ID: 'org_id',
  组织编码: 'org_code',
  组织名称: 'org_name',
};

function quoteIdent(value: string) {
  return `"${value.replace(/"/g, '""')}"`;
}

function buildModelAlias(tableName: string) {
  const parts = tableName.split('_').filter(Boolean);
  if (!parts.length) return 't';
  if (parts[0].length >= 2) return parts[0].slice(0, 3).toLowerCase();
  const raw = parts
    .slice(0, 3)
    .map((item) => item[0])
    .join('')
    .toLowerCase();
  return raw || tableName.slice(0, 2).toLowerCase();
}

function buildFieldAlias(column: string) {
  const parts = column.split('_').filter(Boolean);
  if (!parts.length) return [column.slice(0, 3).toLowerCase()];
  const short = parts
    .map((item) => item[0])
    .join('')
    .toLowerCase();
  const prefix = parts[0].slice(0, 3).toLowerCase();
  return Array.from(new Set([short, prefix])).filter(Boolean);
}

function normalizeTableName(input: string) {
  const normalized = input
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, '_')
    .replace(/^_+|_+$/g, '');
  if (!normalized) return '';
  return normalized;
}

function normalizeColumnName(input: string, index: number) {
  if (HEADER_MAP[input]) return HEADER_MAP[input];
  const normalized = input
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, '_')
    .replace(/^_+|_+$/g, '');
  const fallback = `col_${index + 1}`;
  const value = normalized || fallback;
  return /^[a-z_]/.test(value) ? value : `col_${value}`;
}

function ensureUniqueColumns(columns: string[]) {
  const used = new Map<string, number>();
  return columns.map((name) => {
    const count = used.get(name) || 0;
    used.set(name, count + 1);
    return count === 0 ? name : `${name}_${count + 1}`;
  });
}

function tryParseNumber(value: unknown) {
  if (typeof value === 'number') return value;
  if (typeof value !== 'string') return null;
  const cleaned = value.replace(/,/g, '').trim();
  if (!cleaned) return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

function tryParseDate(value: unknown) {
  if (typeof value !== 'string') return null;
  const cleaned = value.trim();
  if (!cleaned) return null;
  const timestamp = Date.parse(cleaned);
  if (!Number.isFinite(timestamp)) return null;
  return new Date(timestamp);
}

function inferColumnType(values: unknown[]) {
  const sample = values.filter((v) => v !== null && v !== undefined && `${v}`.trim() !== '').slice(0, 60);
  if (!sample.length) return 'TEXT';

  const numericRatio =
    sample.filter((value) => tryParseNumber(value) !== null).length / sample.length;
  if (numericRatio > 0.9) {
    const hasDecimal = sample.some((value) => {
      const n = tryParseNumber(value);
      return n !== null && !Number.isInteger(n);
    });
    return hasDecimal ? 'NUMERIC(18, 2)' : 'BIGINT';
  }

  const dateRatio = sample.filter((value) => tryParseDate(value) !== null).length / sample.length;
  if (dateRatio > 0.9) return 'TIMESTAMPTZ';

  return 'TEXT';
}

function inferFieldType(column: string, pgType: string): FieldType {
  const name = column.toLowerCase();
  if (/(^|_)(id|code|year|date|month)($|_)/.test(name)) return 'dimension';
  if (/(amount|sales|profit|qty|quantity|total|count|num)/.test(name)) return 'measure';
  if (pgType === 'BIGINT' || pgType.startsWith('NUMERIC')) return 'measure';
  return 'dimension';
}

function inferFieldCategory(column: string, fieldType: FieldType): FieldCategory {
  const name = column.toLowerCase();
  if (/(date|time|year|month|day|quarter|week)/.test(name)) return 'time';
  if (/(org|dept|team|company|branch)/.test(name)) return 'organization';
  if (/(region|province|city|area|country)/.test(name)) return 'geography';
  if (/(product|sku|item|category|brand)/.test(name)) return 'product';
  if (/(customer|client|account|member)/.test(name)) return 'customer';
  if (/(sales|amount|income|revenue|profit|cost|tax|expense|price|margin)/.test(name))
    return 'finance';
  if (/(qty|quantity|count|num|volume)/.test(name)) return 'quantity';
  if (/(^id$|_id$|code|key|uuid)/.test(name)) return 'identifier';
  return fieldType === 'measure' ? 'finance' : 'other';
}

function convertByType(value: unknown, pgType: string) {
  if (value === null || value === undefined) return null;
  const str = typeof value === 'string' ? value.trim() : value;
  if (str === '') return null;

  if (pgType.startsWith('NUMERIC') || pgType === 'BIGINT') {
    const n = tryParseNumber(str);
    return n === null ? null : n;
  }

  if (pgType === 'TIMESTAMPTZ') {
    const d = tryParseDate(str as string);
    return d ? d.toISOString() : null;
  }

  return String(str);
}

function parseCsv(content: string) {
  return parse(content, {
    columns: true,
    skip_empty_lines: true,
    bom: true,
    trim: true,
    relax_quotes: true,
  }) as Row[];
}

function parseExcel(buffer: Buffer) {
  const workbook = XLSX.read(buffer, { type: 'buffer' });
  const firstSheet = workbook.SheetNames[0];
  if (!firstSheet) return [];
  return XLSX.utils.sheet_to_json<Row>(workbook.Sheets[firstSheet], { defval: null });
}

type SqlParam = string | number | boolean | null | Date;

function buildInsertStatement(table: string, columns: string[], rows: Row[]) {
  const params: SqlParam[] = [];
  let paramIndex = 1;
  const valueGroups = rows.map((row) => {
    const placeholders = columns.map((col) => {
      const value = row[col] ?? null;
      params.push(
        value === null || typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean' || value instanceof Date
          ? value
          : String(value),
      );
      const placeholder = `$${paramIndex}`;
      paramIndex += 1;
      return placeholder;
    });
    return `(${placeholders.join(',')})`;
  });

  const sql = `INSERT INTO ${quoteIdent(table)} (${columns
    .map((c) => quoteIdent(c))
    .join(',')}) VALUES ${valueGroups.join(',')}`;
  return { sql, params };
}

async function saveSemanticModelConfig(
  tableName: string,
  modelAlias: string,
  columns: string[],
  columnTypes: Record<string, string>,
) {
  const hasSales = columns.includes('sales_amount');
  const hasProfit = columns.includes('profit');
  const derivedMetrics =
    hasSales && hasProfit
      ? [
          {
            name: 'cost_amount',
            expression: '(sales_amount - profit)',
            fieldType: 'measure',
            aliases: ['cost', 'cb', 'cbje'],
            description: '成本金额 = 销售金额 - 利润',
          },
          {
            name: 'profit_rate',
            expression: 'CASE WHEN sales_amount = 0 THEN NULL ELSE profit / sales_amount END',
            fieldType: 'measure',
            aliases: ['margin', 'mrate', 'lrl'],
            description: '利润率 = 利润 / 销售金额',
          },
        ]
      : [];

  const model = {
    modelName: `${tableName}_model`,
    table: tableName,
    modelAlias,
    description: `${tableName} uploaded table`,
    derivedMetrics,
    dimensions: columns.map((column) => {
      const fieldType = inferFieldType(column, String(columnTypes[column]));
      return {
        name: column,
        column,
        fieldType,
        category: inferFieldCategory(column, fieldType),
        aliases: buildFieldAlias(column),
        description: column,
      };
    }),
  };

  const modelDir = path.join(process.cwd(), 'data-models');
  await fs.mkdir(modelDir, { recursive: true });
  const modelPath = path.join(modelDir, `${tableName}.json`);
  await fs.writeFile(modelPath, `${JSON.stringify(model, null, 2)}\n`, 'utf8');
}

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const file = formData.get('file');
    const tableNameInput = String(formData.get('tableName') || '');

    if (!(file instanceof File)) {
      return NextResponse.json({ error: '请先选择文件。' }, { status: 400 });
    }

    const fallbackTableName = normalizeTableName(file.name.replace(/\.[^.]+$/, ''));
    const tableName = normalizeTableName(tableNameInput) || fallbackTableName;
    if (!tableName) {
      return NextResponse.json({ error: '表名不合法，请使用英文/数字/下划线。' }, { status: 400 });
    }

    const extension = file.name.toLowerCase().split('.').pop() || '';
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    let rawRows: Row[] = [];
    if (extension === 'csv') {
      rawRows = parseCsv(buffer.toString('utf8'));
    } else if (extension === 'xlsx' || extension === 'xls') {
      rawRows = parseExcel(buffer);
    } else {
      return NextResponse.json(
        { error: '当前仅支持 CSV / XLSX / XLS 文件。' },
        { status: 400 },
      );
    }

    if (!rawRows.length) {
      return NextResponse.json({ error: '文件为空或无法解析。' }, { status: 400 });
    }

    const rawColumns = Object.keys(rawRows[0]);
    const normalizedColumns = ensureUniqueColumns(
      rawColumns.map((name, idx) => normalizeColumnName(name, idx)),
    );

    const columnMapping = rawColumns.map((raw, idx) => ({
      raw,
      normalized: normalizedColumns[idx],
    }));

    const columnTypes = Object.fromEntries(
      columnMapping.map((item) => [
        item.normalized,
        inferColumnType(rawRows.map((row) => row[item.raw])),
      ]),
    );

    const transformedRows = rawRows.map((rawRow) => {
      const row: Row = {};
      for (const item of columnMapping) {
        const pgType = String(columnTypes[item.normalized]);
        row[item.normalized] = convertByType(rawRow[item.raw], pgType);
      }
      return row;
    });

    const sql = getDbClient();
    const ddlColumns = normalizedColumns
      .map((col) => `${quoteIdent(col)} ${String(columnTypes[col])}`)
      .join(',\n');

    await sql.unsafe(`DROP TABLE IF EXISTS ${quoteIdent(tableName)}`);
    await sql.unsafe(`CREATE TABLE ${quoteIdent(tableName)} (${ddlColumns})`);

    const batchSize = 500;
    for (let i = 0; i < transformedRows.length; i += batchSize) {
      const batch = transformedRows.slice(i, i + batchSize);
      const statement = buildInsertStatement(tableName, normalizedColumns, batch);
      await sql.unsafe(statement.sql, statement.params);
    }

    const modelAlias = buildModelAlias(tableName);
    await saveSemanticModelConfig(tableName, modelAlias, normalizedColumns, columnTypes);

    const firstMeasure =
      normalizedColumns.find((col) => inferFieldType(col, String(columnTypes[col])) === 'measure') ||
      normalizedColumns[0];
    const firstDimension =
      normalizedColumns.find((col) => inferFieldType(col, String(columnTypes[col])) === 'dimension') ||
      normalizedColumns[0];
    const suggestedQuestion = `统计 ${modelAlias}.${buildFieldAlias(firstDimension)[0]} 的 ${modelAlias}.${buildFieldAlias(firstMeasure)[0]} 并按降序`;

    return NextResponse.json({
      ok: true,
      tableName,
      rowCount: transformedRows.length,
      columns: normalizedColumns,
      modelAlias,
      suggestedQuestion,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
