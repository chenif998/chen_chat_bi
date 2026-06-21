import { getDbClient } from '@/lib/db';
import { listValueAliases } from '@/lib/models/valueAliasStore';

interface ValueEntry {
  table: string;
  column: string;
  value: string;
}

interface ValueFilter {
  table: string;
  column: string;
  value: string;
}

const VALUE_COLUMNS: Record<string, string[]> = {
  dw_sa_fact_saledetail_260422: [
    'ship_mode',
    'product_category',
    'product_type',
    'customer_type',
    'region',
    'province',
    'org_name',
    'city_short',
  ],
  sales_data: ['category', 'region', 'product_name'],
};

let cachedEntries: ValueEntry[] = [];
let lastLoadedAt = 0;
const CACHE_TTL_MS = 5 * 60 * 1000;

function normalize(value: string) {
  return value.trim().toLowerCase();
}

function isUsableValue(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return false;
  if (trimmed.length < 2) return false;
  return true;
}

async function loadValueEntries() {
  const now = Date.now();
  if (cachedEntries.length && now - lastLoadedAt < CACHE_TTL_MS) {
    return cachedEntries;
  }

  const sql = getDbClient();
  const nextEntries: ValueEntry[] = [];

  for (const [table, columns] of Object.entries(VALUE_COLUMNS)) {
    for (const column of columns) {
      try {
        const query = `
          SELECT DISTINCT ${column}::text AS value
          FROM ${table}
          WHERE ${column} IS NOT NULL
          LIMIT 300
        `;
        const rows = await sql.unsafe<{ value: string }[]>(query);
        for (const row of rows) {
          const value = row.value?.trim();
          if (!value || !isUsableValue(value)) continue;
          nextEntries.push({ table, column, value });
        }
      } catch {
        // Ignore missing tables/columns for resiliency across model changes.
      }
    }
  }

  cachedEntries = nextEntries;
  lastLoadedAt = now;
  return cachedEntries;
}

export async function detectValueFilters(question: string) {
  const q = normalize(question);
  const entries = await loadValueEntries();
  const aliasEntries = await listValueAliases();

  const matches = entries.filter((entry) => q.includes(normalize(entry.value)));
  for (const alias of aliasEntries) {
    if (q.includes(normalize(alias.alias))) {
      matches.push({
        table: alias.table,
        column: alias.column,
        value: alias.value,
      });
    }
  }
  if (!matches.length) return [] as ValueFilter[];

  const dedup = new Map<string, ValueFilter>();
  for (const match of matches) {
    const key = `${match.table}.${match.column}.${match.value}`;
    if (!dedup.has(key)) {
      dedup.set(key, {
        table: match.table,
        column: match.column,
        value: match.value,
      });
    }
  }
  return Array.from(dedup.values());
}

export function buildValueFilterHint(filters: ValueFilter[]) {
  if (!filters.length) return '- none';
  return filters
    .map((item) => `- ${item.table}.${item.column} = '${item.value}'`)
    .join('\n');
}

export async function normalizeQuestionByValueAliases(question: string) {
  const aliases = await listValueAliases();
  let normalized = question;

  for (const item of aliases) {
    const alias = item.alias?.trim();
    const canonical = item.value?.trim();
    if (!alias || !canonical) continue;
    const escaped = alias.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(escaped, 'gi');
    normalized = normalized.replace(regex, canonical);
  }

  return normalized;
}

