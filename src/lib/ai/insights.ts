import { aiClient, aiModel, hasValidAiKey } from '@/lib/ai/client';

function parseJsonFromModelOutput(content: string) {
  const trimmed = content.trim();
  try {
    return JSON.parse(trimmed) as { insights: string[]; recommendations: string[] };
  } catch {
    const codeBlockMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
    if (codeBlockMatch?.[1]) {
      return JSON.parse(codeBlockMatch[1]) as {
        insights: string[];
        recommendations: string[];
      };
    }
    throw new Error('Model output is not valid JSON');
  }
}

export async function generateInsights(question: string, rows: unknown[]) {
  if (!hasValidAiKey) {
    return {
      insights: ['未配置可用的 AI Key，暂时无法自动洞察。'],
      recommendations: ['请在 .env.local 中设置有效的 DEEPSEEK_API_KEY。'],
    };
  }

  const sampleRows = rows.slice(0, 30);
  const financeIntent = /(利润|成本|销售额|营收|毛利|利润率|费用|税金)/.test(question);
  const prompt = `
You are a senior business analyst.
Given the user's question and query result rows, produce:
- 3 concise insights
- 2 actionable recommendations

Requirements:
- Use plain Chinese.
- Be specific to the data; do not invent columns.
- If rows are empty, explain no data and suggest next checks.
- If question relates to finance/profit/cost/sales, prioritize margin, cost structure, and profitability actions.
- Return strict JSON:
{"insights":["...","...","..."],"recommendations":["...","..."]}

User Question: ${question}
Finance related question: ${financeIntent ? 'yes' : 'no'}
Rows JSON: ${JSON.stringify(sampleRows)}
`;

  try {
    const response = await aiClient.chat.completions.create({
      model: aiModel,
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.2,
    });

    const content = response.choices[0].message.content?.trim();
    if (!content) {
      return {
        insights: ['暂无可用分析结果。'],
        recommendations: ['请检查查询条件后重试。'],
      };
    }

    const parsed = parseJsonFromModelOutput(content);
    return {
      insights: parsed.insights?.length ? parsed.insights : ['暂无可用分析结果。'],
      recommendations: parsed.recommendations?.length
        ? parsed.recommendations
        : ['请结合图表进一步确认业务变化。'],
    };
  } catch (error) {
    console.error('Error generating insights:', error);
    return {
      insights: ['AI 分析暂时不可用。'],
      recommendations: ['可先查看图表和明细数据，再稍后重试分析。'],
    };
  }
}
