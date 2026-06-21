# Chat BI (Supabase + DeepSeek)

## Run Local

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Environment Variables

Use `.env.local`:

```bash
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
DATABASE_URL=
DEEPSEEK_API_KEY=
DEEPSEEK_BASE_URL=https://api.deepseek.com
AI_MODEL=deepseek-chat
SITE_PASSWORD=your-access-password
```

`SITE_PASSWORD` enables site-wide access protection (login page + API guard). Leave it empty locally to skip auth during development.

## Semantic Layer (Folder-based Model/Dimension Search)

The project supports model/dimension search from folder configs:

- Config folder: `data-models/`
- Example file: `data-models/sales_data.json`
- Each file defines:
  - model alias (for shorthand table location)
  - dimensions/measures
  - aliases for shorthand lookup

### Shorthand Syntax

You can reference fields in questions by shorthand:

- `sd.reg` -> `sales_data.region`
- `sd.amt` -> `sales_data.sales_amount`

NL2SQL will prioritize resolved shorthand references when generating SQL.

## Multi-turn Conversation & History

- Conversation sessions are persisted in Supabase Postgres.
- Backend APIs:
  - `POST /api/query` (supports `sessionId` for multi-turn context)
  - `GET /api/sessions` (list sessions)
  - `GET /api/sessions/:sessionId` (load message history)
- Chat tables are auto-created on first request.
- You can also run `chat_history_schema.sql` manually in Supabase SQL Editor.

## Deployment (Netlify)

Deploy with Netlify and set the same environment variables in the Netlify dashboard.
Set `SITE_PASSWORD` in production so only people with the password can access the site and APIs.
`netlify.toml` is included with `@netlify/plugin-nextjs`.
