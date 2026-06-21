import OpenAI from 'openai';

function isUsableApiKey(value: string | undefined) {
  if (!value) return false;
  const trimmed = value.trim();
  if (trimmed.length < 12) return false;
  if (trimmed.includes('你的') || trimmed.includes('YOUR_')) return false;
  if (trimmed.includes('连接字符串')) return false;
  return true;
}

const apiKey = isUsableApiKey(process.env.DEEPSEEK_API_KEY)
  ? process.env.DEEPSEEK_API_KEY
  : process.env.OPENAI_API_KEY;
const baseURL = process.env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com';

if (!isUsableApiKey(apiKey)) {
  console.warn('AI API key is missing. Set DEEPSEEK_API_KEY in .env.local.');
}

export const aiClient = new OpenAI({
  apiKey,
  baseURL,
  timeout: 20000,
  maxRetries: 1,
});

export const aiModel = process.env.AI_MODEL || 'deepseek-chat';

export const hasValidAiKey = isUsableApiKey(apiKey);
