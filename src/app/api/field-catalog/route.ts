import { NextResponse } from 'next/server';
import { listModelFieldCatalog } from '@/lib/models/semanticLayer';

export async function GET() {
  try {
    const catalog = await listModelFieldCatalog();
    return NextResponse.json({ catalog });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
