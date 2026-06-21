import { NextResponse } from 'next/server';
import { listMessages } from '@/lib/chat/store';

interface RouteContext {
  params: Promise<{ sessionId: string }>;
}

export async function GET(_: Request, context: RouteContext) {
  try {
    const { sessionId } = await context.params;
    const messages = await listMessages(sessionId);
    return NextResponse.json({ messages });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
