import { NextResponse } from 'next/server';
import {
  deleteValueAlias,
  listValueAliases,
  type ValueAliasItem,
  upsertValueAlias,
} from '@/lib/models/valueAliasStore';

export async function GET() {
  try {
    const aliases = await listValueAliases();
    return NextResponse.json({ aliases });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as ValueAliasItem;
    const aliases = await upsertValueAlias(body);
    return NextResponse.json({ aliases });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

export async function DELETE(request: Request) {
  try {
    const body = (await request.json()) as { alias?: string };
    if (!body.alias) {
      return NextResponse.json({ error: 'alias is required' }, { status: 400 });
    }
    const aliases = await deleteValueAlias(body.alias);
    return NextResponse.json({ aliases });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
