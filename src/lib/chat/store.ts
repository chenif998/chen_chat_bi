import { getDbClient } from '@/lib/db';

export interface ChatSessionItem {
  id: string;
  title: string;
  updated_at: string;
  created_at: string;
  last_message: string | null;
}

export interface ChatMessageItem {
  id: number;
  session_id: string;
  role: 'user' | 'assistant';
  content: string;
  payload: Record<string, unknown> | null;
  created_at: string;
}

let initialized = false;

async function ensureChatTables() {
  if (initialized) return;
  const sql = getDbClient();
  await sql.unsafe(`
    CREATE TABLE IF NOT EXISTS chat_sessions (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS chat_messages (
      id BIGSERIAL PRIMARY KEY,
      session_id TEXT NOT NULL REFERENCES chat_sessions(id) ON DELETE CASCADE,
      role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
      content TEXT NOT NULL,
      payload JSONB,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS idx_chat_messages_session_created
      ON chat_messages(session_id, created_at DESC);

    CREATE INDEX IF NOT EXISTS idx_chat_sessions_updated_at
      ON chat_sessions(updated_at DESC);
  `);
  initialized = true;
}

function buildTitleFromQuestion(question: string) {
  return question.trim().slice(0, 36) || 'New Chat';
}

export async function ensureSession(sessionId: string, firstQuestion?: string) {
  await ensureChatTables();
  const sql = getDbClient();
  const existing = await sql<{ id: string }[]>`
    SELECT id FROM chat_sessions WHERE id = ${sessionId} LIMIT 1
  `;
  if (existing.length) return;

  await sql`
    INSERT INTO chat_sessions (id, title)
    VALUES (${sessionId}, ${buildTitleFromQuestion(firstQuestion || '')})
  `;
}

export async function touchSession(sessionId: string) {
  await ensureChatTables();
  const sql = getDbClient();
  await sql`
    UPDATE chat_sessions
    SET updated_at = NOW()
    WHERE id = ${sessionId}
  `;
}

export async function saveMessage(
  sessionId: string,
  role: 'user' | 'assistant',
  content: string,
  payload?: Record<string, unknown>,
) {
  await ensureChatTables();
  const sql = getDbClient();
  await sql`
    INSERT INTO chat_messages (session_id, role, content, payload)
    VALUES (${sessionId}, ${role}, ${content}, ${payload ? sql.json(payload) : null})
  `;
}

export async function listSessions() {
  await ensureChatTables();
  const sql = getDbClient();
  const rows = await sql<ChatSessionItem[]>`
    SELECT
      s.id,
      s.title,
      s.updated_at,
      s.created_at,
      (
        SELECT m.content
        FROM chat_messages m
        WHERE m.session_id = s.id
        ORDER BY m.created_at DESC
        LIMIT 1
      ) AS last_message
    FROM chat_sessions s
    ORDER BY s.updated_at DESC
    LIMIT 50
  `;
  return rows;
}

export async function listMessages(sessionId: string) {
  await ensureChatTables();
  const sql = getDbClient();
  const rows = await sql<ChatMessageItem[]>`
    SELECT id, session_id, role, content, payload, created_at
    FROM chat_messages
    WHERE session_id = ${sessionId}
    ORDER BY created_at ASC
  `;
  return rows;
}

export async function listRecentQuestions(sessionId: string, limit = 5) {
  await ensureChatTables();
  const sql = getDbClient();
  const rows = await sql<{ content: string }[]>`
    SELECT content
    FROM chat_messages
    WHERE session_id = ${sessionId}
      AND role = 'user'
    ORDER BY created_at DESC
    LIMIT ${limit}
  `;
  return rows.map((item) => item.content).reverse();
}
