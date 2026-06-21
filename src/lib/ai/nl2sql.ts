import { aiClient, aiModel, hasValidAiKey } from '@/lib/ai/client';
import type { QueryPlan } from '@/lib/ai/types';
import {
  buildSemanticSchemaPrompt,
  loadSemanticModels,
  resolveShorthand,
} from '@/lib/models/semanticLayer';
import { getBusinessDocsPromptContext } from '@/lib/models/valueMappings';

function parseQueryPlan(content: string) {
  const trimmed = content.trim();
  try {
    return JSON.parse(trimmed) as QueryPlan;
  } catch {
    const codeBlockMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
    if (!codeBlockMatch?.[1]) {
      throw new Error('Invalid query plan JSON');
    }
    return JSON.parse(codeBlockMatch[1]) as QueryPlan;
  }
}

export async function generateQueryPlan(
  userInput: string,
  contextQuestions: string[] = [],
  valueFilterHint = '- none',
): Promise<QueryPlan> {
  if (!hasValidAiKey) {
    throw new Error('AI API key is invalid. Please set DEEPSEEK_API_KEY with a real value.');
  }

  const models = await loadSemanticModels();
  const semanticSchema = buildSemanticSchemaPrompt(models);
  const businessDocContext = await getBusinessDocsPromptContext();
  const shorthandRefs = resolveShorthand(userInput, models);
  const shorthandHint = shorthandRefs.length
    ? shorthandRefs
        .map((ref) => `- ${ref.token} => ${ref.resolved} (${ref.fieldType})`)
        .join('\n')
    : '- no shorthand reference found';

  const prompt = `
You are an expert BI analyst.
Given a user question and database schema, return:
1) a valid PostgreSQL SELECT query
2) the best chart type: one of "bar", "line", "pie", "scatter", "table"
3) a short reason.

Rules:
- Output MUST be strict JSON only.
- SQL must be a single SELECT statement.
- Never use INSERT/UPDATE/DELETE/ALTER/DROP/TRUNCATE.
- Keep SQL concise and business-friendly.
- If chart is not suitable, use "table".
- For derived metrics, always use their provided SQL formula.
- Region values must use exact values in dataset: 华东区, 华南区, 东北区, 华北区, 西南区, 西北区.
- If user says 华北/北分公司 use 华北区; 华南/南分公司 use 华南区; 华东/东分公司 use 华东区.
- If user asks province comparison (e.g., 山西 vs 内蒙古), use province column and keep each province as separate rows.
- If detected value filters are provided, you should honor them in WHERE clause.
- For metric-only queries like "京东利润", return aggregated metric (e.g. SUM(profit)) instead of row details.

Semantic Schema:
${semanticSchema}

Business reference docs:
${businessDocContext}

Resolved shorthand references:
${shorthandHint}

If shorthand references exist, prioritize these resolved columns in SQL.

Detected value filters:
${valueFilterHint}

Recent conversation context:
${contextQuestions.length ? contextQuestions.map((q) => `- ${q}`).join('\n') : '- none'}

User Question: "${userInput}"

Return JSON format:
{"sql":"...","chartType":"bar","reason":"..."}
`;

  try {
    const response = await aiClient.chat.completions.create({
      model: aiModel,
      messages: [{ role: 'user', content: prompt }],
      temperature: 0,
    });

    const content = response.choices[0].message.content?.trim();
    if (!content) {
      throw new Error('Empty model response');
    }

    const parsed = parseQueryPlan(content);
    if (!parsed.sql || !parsed.chartType) {
      throw new Error('Invalid query plan format');
    }

    return parsed;
  } catch (error) {
    console.error('Error generating query plan:', error);
    throw new Error('Failed to generate query plan');
  }
}
