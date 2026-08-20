import { NextResponse } from 'next/server';
import { sql } from 'drizzle-orm';
import { db } from '@/db/client';

export const dynamic = 'force-dynamic';

/**
 * Liveness and readiness in one endpoint. Returns 503 when the database is
 * unreachable so a load balancer takes the instance out of rotation.
 */
export async function GET() {
  const startedAt = Date.now();
  try {
    await db.execute(sql`select 1`);
    return NextResponse.json({
      status: 'ok',
      database: 'ok',
      latencyMs: Date.now() - startedAt,
      time: new Date().toISOString(),
    });
  } catch (error) {
    return NextResponse.json(
      {
        status: 'degraded',
        database: 'unreachable',
        error: error instanceof Error ? error.message : 'unknown error',
        time: new Date().toISOString(),
      },
      { status: 503 },
    );
  }
}
