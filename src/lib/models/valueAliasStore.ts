import { promises as fs } from 'node:fs';
import path from 'node:path';

export interface ValueAliasItem {
  alias: string;
  table: string;
  column: string;
  value: string;
}

const FILE_PATH = path.join(process.cwd(), 'data-models', 'value-aliases.json');

function normalizeAlias(alias: string) {
  return alias.trim().toLowerCase();
}

async function ensureFile() {
  await fs.mkdir(path.dirname(FILE_PATH), { recursive: true });
  try {
    await fs.access(FILE_PATH);
  } catch {
    await fs.writeFile(FILE_PATH, '[]\n', 'utf8');
  }
}

export async function listValueAliases() {
  await ensureFile();
  const raw = await fs.readFile(FILE_PATH, 'utf8');
  const parsed = JSON.parse(raw) as ValueAliasItem[];
  return parsed || [];
}

export async function upsertValueAlias(input: ValueAliasItem) {
  const alias = normalizeAlias(input.alias);
  if (!alias || !input.table || !input.column || !input.value) {
    throw new Error('alias/table/column/value are required');
  }

  const all = await listValueAliases();
  const next = all.filter((item) => normalizeAlias(item.alias) !== alias);
  next.push({
    alias,
    table: input.table.trim(),
    column: input.column.trim(),
    value: input.value.trim(),
  });
  await fs.writeFile(FILE_PATH, `${JSON.stringify(next, null, 2)}\n`, 'utf8');
  return next;
}

export async function deleteValueAlias(alias: string) {
  const normalized = normalizeAlias(alias);
  const all = await listValueAliases();
  const next = all.filter((item) => normalizeAlias(item.alias) !== normalized);
  await fs.writeFile(FILE_PATH, `${JSON.stringify(next, null, 2)}\n`, 'utf8');
  return next;
}
