import { promises as fs } from 'node:fs';
import path from 'node:path';

interface DimensionItem {
  维度编码: string;
  维度值: string;
  说明?: string;
}

interface ModelIndicatorItem {
  指标名称: string;
  指标字段名称: string;
  指标说明?: string;
}

interface ModelDimensionItem {
  维度名称: string;
  维度字段名称: string;
}

interface ModelDoc {
  模型名称?: string;
  模型编码?: string;
  模型表名?: string;
  模型指标?: ModelIndicatorItem[];
  模型维度?: ModelDimensionItem[];
}

let cachedDimensionMap: Record<string, string> | null = null;
let cachedModelMap: Record<string, string> | null = null;
let cachedModelDoc: ModelDoc | null = null;
let cachedOrgRegionMap: Record<string, string> | null = null;

function splitAliases(raw?: string) {
  if (!raw) return [];
  return raw
    .split(/[，,、\s]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function buildBranchAlias(canonical: string) {
  const match = canonical.match(/^(.{2,})分公司$/);
  if (!match) return [];
  const city = match[1];
  const short = city[0];
  return [`${short}分公司`];
}

function normalize(value: string) {
  return value.trim().toLowerCase();
}

function inferRegionByOrgName(orgName: string) {
  if (orgName.includes('北京') || orgName.includes('河北')) return '华北区';
  if (orgName.includes('沈阳')) return '东北区';
  if (orgName.includes('南京')) return '华东区';
  return '';
}

async function loadDimensionItems() {
  try {
    const filePath = path.join(process.cwd(), '..', '维度信息.md');
    const raw = await fs.readFile(filePath, 'utf8');
    const jsonPart = raw.split('=====')[0].trim();
    if (!jsonPart) return [];
    const parsed = JSON.parse(jsonPart) as { 维度条目?: DimensionItem[] };
    return parsed.维度条目 || [];
  } catch {
    return [];
  }
}

async function loadModelDoc() {
  if (cachedModelDoc) return cachedModelDoc;
  try {
    const filePath = path.join(process.cwd(), '..', '数据模型.md');
    const raw = await fs.readFile(filePath, 'utf8');
    const jsonPart = raw.split('=====')[0].trim();
    if (!jsonPart) {
      cachedModelDoc = {};
      return cachedModelDoc;
    }
    cachedModelDoc = JSON.parse(jsonPart) as ModelDoc;
    return cachedModelDoc;
  } catch {
    cachedModelDoc = {};
    return cachedModelDoc;
  }
}

export async function getDimensionAliasMap() {
  if (cachedDimensionMap) return cachedDimensionMap;

  const items = await loadDimensionItems();
  const map: Record<string, string> = {};

  for (const item of items) {
    const canonical = item.维度值?.trim();
    if (!canonical) continue;
    map[normalize(canonical)] = canonical;

    for (const alias of splitAliases(item.说明)) {
      map[normalize(alias)] = canonical;
    }
    for (const alias of buildBranchAlias(canonical)) {
      map[normalize(alias)] = canonical;
    }
  }

  cachedDimensionMap = map;
  return map;
}

export async function getOrgRegionMap() {
  if (cachedOrgRegionMap) return cachedOrgRegionMap;
  const items = await loadDimensionItems();
  const map: Record<string, string> = {};

  for (const item of items) {
    if (item.维度编码 !== 'org') continue;
    const canonical = item.维度值?.trim();
    if (!canonical) continue;
    const region = inferRegionByOrgName(canonical);
    if (region) {
      map[canonical] = region;
    }
  }

  cachedOrgRegionMap = map;
  return map;
}

function mapIndicatorToBusinessWord(fieldName: string, indicatorName: string) {
  const normalized = normalize(fieldName);
  if (normalized === 'income') return '销售金额';
  if (normalized === 'cost') return '成本';
  if (normalized === 'profit') return '利润';
  if (normalized === 'tax') return '税金';
  if (normalized === 'sell_expense') return '销售费用';
  if (normalized === 'manage_expense') return '管理费用';
  if (normalized === 'finance_expense') return '财务费用';
  return indicatorName;
}

export async function getModelAliasMap() {
  if (cachedModelMap) return cachedModelMap;

  const modelDoc = await loadModelDoc();
  const map: Record<string, string> = {};

  for (const metric of modelDoc.模型指标 || []) {
    const canonical = mapIndicatorToBusinessWord(metric.指标字段名称, metric.指标名称);
    const aliases = [metric.指标名称, metric.指标字段名称, ...splitAliases(metric.指标说明)];
    for (const alias of aliases) {
      if (!alias) continue;
      map[normalize(alias)] = canonical;
    }
  }

  for (const dim of modelDoc.模型维度 || []) {
    if (dim.维度名称) map[normalize(dim.维度名称)] = dim.维度名称;
    if (dim.维度字段名称) map[normalize(dim.维度字段名称)] = dim.维度名称;
  }

  cachedModelMap = map;
  return map;
}

export async function getBusinessDocsPromptContext() {
  const modelDoc = await loadModelDoc();
  const dimItems = await loadDimensionItems();
  const orgRegionMap = await getOrgRegionMap();
  const indicators = (modelDoc.模型指标 || [])
    .map((item) => {
      const aliases = splitAliases(item.指标说明).join(', ');
      return `- ${item.指标名称} (${item.指标字段名称})${aliases ? ` aliases: [${aliases}]` : ''}`;
    })
    .join('\n');
  const dimensions = (modelDoc.模型维度 || [])
    .map((item) => `- ${item.维度名称} (${item.维度字段名称})`)
    .join('\n');
  const dimensionValues = dimItems
    .map((item) => {
      const aliases = splitAliases(item.说明).join(', ');
      return `- ${item.维度编码}: ${item.维度值}${aliases ? ` aliases: [${aliases}]` : ''}`;
    })
    .join('\n');

  const orgRegionHints = Object.entries(orgRegionMap)
    .map(([org, region]) => `- ${org} => ${region}`)
    .join('\n');

  return `Model doc (${modelDoc.模型名称 || 'unknown model'}):
Table hint: ${modelDoc.模型表名 || 'unknown'}
Indicators:
${indicators || '- none'}
Dimensions:
${dimensions || '- none'}
Dimension dictionary:
${dimensionValues || '- none'}
Org to region mapping (for current fact table):
${orgRegionHints || '- none'}`;
}

export async function normalizeByDimensionAliases(question: string) {
  const [dimensionMap, modelMap] = await Promise.all([getDimensionAliasMap(), getModelAliasMap()]);
  const aliasMap = { ...modelMap, ...dimensionMap };
  let normalized = question;

  const aliases = Object.keys(aliasMap).sort((a, b) => b.length - a.length);
  for (const alias of aliases) {
    const canonical = aliasMap[alias];
    if (!canonical) continue;
    const escaped = alias.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(escaped, 'gi');
    normalized = normalized.replace(regex, canonical);
  }

  return normalized;
}

export async function normalizeOrgInQuestion(question: string) {
  const orgRegionMap = await getOrgRegionMap();
  let normalized = question;

  const orgNames = Object.keys(orgRegionMap).sort((a, b) => b.length - a.length);
  for (const orgName of orgNames) {
    const region = orgRegionMap[orgName];
    if (!region) continue;
    const escaped = orgName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(escaped, 'g');
    normalized = normalized.replace(regex, region);
  }

  return normalized;
}
