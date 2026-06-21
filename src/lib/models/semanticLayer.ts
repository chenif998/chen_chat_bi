import { promises as fs } from 'node:fs';
import path from 'node:path';

export interface SemanticField {
  name: string;
  column: string;
  fieldType: 'dimension' | 'measure';
  category?:
    | 'time'
    | 'organization'
    | 'geography'
    | 'product'
    | 'customer'
    | 'finance'
    | 'quantity'
    | 'identifier'
    | 'other';
  aliases?: string[];
  description?: string;
}

export interface DerivedMetric {
  name: string;
  expression: string;
  fieldType: 'measure';
  aliases?: string[];
  description?: string;
}

export interface SemanticModel {
  modelName: string;
  table: string;
  modelAlias: string;
  description?: string;
  dimensions: SemanticField[];
  derivedMetrics?: DerivedMetric[];
}

interface ResolvedRef {
  token: string;
  resolved: string;
  fieldType: 'dimension' | 'measure';
}

const MODEL_DIR = path.join(process.cwd(), 'data-models');

function inferCategory(column: string, fieldType: 'dimension' | 'measure') {
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

async function readModelFile(filePath: string) {
  const raw = await fs.readFile(filePath, 'utf8');
  const parsed = JSON.parse(raw) as SemanticModel;
  parsed.dimensions = (parsed.dimensions || []).map((field) => ({
    ...field,
    category: field.category || inferCategory(field.column || field.name, field.fieldType),
  }));
  return parsed;
}

export async function loadSemanticModels() {
  try {
    const entries = await fs.readdir(MODEL_DIR);
    const files = entries.filter((name) => name.endsWith('.json'));
    const models = await Promise.all(
      files.map((name) => readModelFile(path.join(MODEL_DIR, name))),
    );
    return models;
  } catch {
    return [];
  }
}

function normalize(value: string) {
  return value.trim().toLowerCase();
}

function findFieldByAlias(model: SemanticModel, shortName: string) {
  const normalized = normalize(shortName);
  return model.dimensions.find((field) => {
    if (normalize(field.name) === normalized) return true;
    if (normalize(field.column) === normalized) return true;
    return (field.aliases || []).some((alias) => normalize(alias) === normalized);
  });
}

function findDerivedByAlias(model: SemanticModel, shortName: string) {
  const normalized = normalize(shortName);
  return (model.derivedMetrics || []).find((metric) => {
    if (normalize(metric.name) === normalized) return true;
    return (metric.aliases || []).some((alias) => normalize(alias) === normalized);
  });
}

export function resolveShorthand(question: string, models: SemanticModel[]) {
  const refs: ResolvedRef[] = [];
  const matches = question.match(/[a-zA-Z][\w]*\.[a-zA-Z][\w]*/g) || [];

  for (const token of matches) {
    const [modelAlias, dimAlias] = token.split('.');
    const model = models.find((item) => normalize(item.modelAlias) === normalize(modelAlias));
    if (!model) continue;

    const derived = findDerivedByAlias(model, dimAlias);
    if (derived) {
      refs.push({
        token,
        resolved: derived.expression,
        fieldType: derived.fieldType,
      });
      continue;
    }

    const field = findFieldByAlias(model, dimAlias);
    if (!field) continue;

    refs.push({
      token,
      resolved: `${model.table}.${field.column}`,
      fieldType: field.fieldType,
    });
  }

  return refs;
}

export function buildSemanticSchemaPrompt(models: SemanticModel[]) {
  if (!models.length) {
    return `
Table: sales_data
Columns:
- id: BIGINT
- product_name: TEXT
- category: TEXT
- sales_amount: DECIMAL
- order_date: DATE
- region: TEXT
`;
  }

  return models
    .map((model) => {
      const fields = model.dimensions
        .map((field) => {
          const aliases = field.aliases?.length ? ` aliases: [${field.aliases.join(', ')}]` : '';
          const category = field.category ? ` category: ${field.category}` : '';
          return `- ${field.column} (${field.fieldType})${category}${aliases}`;
        })
        .join('\n');

      const derived = (model.derivedMetrics || [])
        .map((metric) => {
          const aliases = metric.aliases?.length ? ` aliases: [${metric.aliases.join(', ')}]` : '';
          return `- ${metric.name} (${metric.fieldType}) formula: ${metric.expression}${aliases}`;
        })
        .join('\n');

      return `Model ${model.modelName} (alias: ${model.modelAlias})\nTable: ${model.table}\n${fields}${derived ? `\nDerived metrics:\n${derived}` : ''}`;
    })
    .join('\n\n');
}

export async function listModelFieldCatalog() {
  const models = await loadSemanticModels();
  return models.map((model) => ({
    modelName: model.modelName,
    table: model.table,
    modelAlias: model.modelAlias,
    fields: model.dimensions.map((field) => ({
      name: field.name,
      column: field.column,
      fieldType: field.fieldType,
      category: field.category || inferCategory(field.column || field.name, field.fieldType),
      aliases: field.aliases || [],
      description: field.description || '',
    })),
  }));
}
