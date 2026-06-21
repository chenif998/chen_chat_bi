import { readFile } from 'node:fs/promises';
import postgres from 'postgres';
import { parse } from 'csv-parse/sync';

const csvPath = process.argv[2] || '../dw_sa_fact_saledetail_260422.csv';
const connectionString = process.env.DATABASE_URL;
const targetTable = 'dw_sa_fact_saledetail_260422';

if (!connectionString) {
  throw new Error('DATABASE_URL is missing. Run with --env-file=.env.local');
}

const sql = postgres(connectionString, { ssl: 'require' });

function toInt(value) {
  if (value === undefined || value === null || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? Math.trunc(n) : null;
}

function toDecimal(value) {
  if (value === undefined || value === null || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function toDate(value) {
  if (!value) return null;
  return value;
}

async function run() {
  const content = await readFile(csvPath, 'utf8');
  const records = parse(content, {
    columns: true,
    skip_empty_lines: true,
    bom: true,
    relax_quotes: true,
    trim: true,
  });

  const rows = records.map((item) => ({
    order_date: toDate(item['订单日期']),
    order_year: toInt(item['订单年']),
    order_year_month: item['订单年月'] || null,
    ship_mode: item['邮寄方式'] || null,
    product_code: item['产品编码'] || null,
    product_name: item['产品名称'] || null,
    product_type: item['产品类型'] || null,
    product_category: item['产品大类'] || null,
    customer_code: item['客户编码'] || null,
    customer_name: item['客户名称'] || null,
    customer_type: item['客户类型'] || null,
    region: item['大区'] || null,
    province: item['省份'] || null,
    city_short: item['城市简称'] || null,
    sales_amount: toDecimal(item['销售金额']),
    profit: toDecimal(item['利润']),
    quantity: toInt(item['数量']),
    review_date: toDate(item['审核日期']),
    org_id: toInt(item['组织ID']),
    org_code: item['组织编码'] || null,
    org_name: item['组织名称'] || null,
  }));

  await sql.unsafe(`
    CREATE TABLE IF NOT EXISTS ${targetTable} (
      id BIGSERIAL PRIMARY KEY,
      order_date DATE,
      order_year INT,
      order_year_month TEXT,
      ship_mode TEXT,
      product_code TEXT,
      product_name TEXT,
      product_type TEXT,
      product_category TEXT,
      customer_code TEXT,
      customer_name TEXT,
      customer_type TEXT,
      region TEXT,
      province TEXT,
      city_short TEXT,
      sales_amount NUMERIC(18, 2),
      profit NUMERIC(18, 2),
      quantity INT,
      review_date DATE,
      org_id BIGINT,
      org_code TEXT,
      org_name TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await sql.unsafe(`TRUNCATE TABLE ${targetTable}`);

  const batchSize = 500;
  const columns = [
    'order_date',
    'order_year',
    'order_year_month',
    'ship_mode',
    'product_code',
    'product_name',
    'product_type',
    'product_category',
    'customer_code',
    'customer_name',
    'customer_type',
    'region',
    'province',
    'city_short',
    'sales_amount',
    'profit',
    'quantity',
    'review_date',
    'org_id',
    'org_code',
    'org_name',
  ];

  for (let i = 0; i < rows.length; i += batchSize) {
    const batch = rows.slice(i, i + batchSize);
    await sql`INSERT INTO dw_sa_fact_saledetail_260422 ${sql(batch, columns)}`;
  }

  const countRows = await sql.unsafe(`SELECT COUNT(*)::int AS total FROM ${targetTable}`);
  console.log(`Imported rows: ${countRows[0].total}`);
}

run()
  .then(async () => {
    await sql.end();
  })
  .catch(async (error) => {
    console.error('Import failed:', error.message);
    await sql.end();
    process.exit(1);
  });
