import { NextResponse } from 'next/server';
import { listSessions } from '@/lib/chat/store';

export async function GET() {
  try {
    const sessions = await listSessions();
    return NextResponse.json({ sessions });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
