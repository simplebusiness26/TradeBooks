import { NextResponse } from 'next/server';
import { db } from '@/db/client';
import { getAuthContext } from '@/lib/auth-context';
import { getDocument } from '@/domain/documents';
import { getStorage } from '@/adapters/storage';

export const dynamic = 'force-dynamic';

/**
 * Streams the original uploaded file. Access is checked against the signed-in
 * user's company, so knowing a document id is not enough to read it.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const context = await getAuthContext();
  if (!context) return new NextResponse('Sign in to view this file.', { status: 401 });

  const { id } = await params;
  const document = await getDocument(db, context.company.id, id).catch(() => null);
  if (!document) return new NextResponse('Not found', { status: 404 });

  try {
    const buffer = await getStorage().get(document.storageKey);
    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        'content-type': document.contentType,
        'content-length': String(buffer.byteLength),
        'content-disposition': `inline; filename="${document.originalFilename.replace(/"/g, '')}"`,
        'cache-control': 'private, max-age=300',
        'x-content-type-options': 'nosniff',
        // Uploaded files are never trusted to run anything.
        'content-security-policy': "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; sandbox",
      },
    });
  } catch {
    return new NextResponse('The stored file could not be read.', { status: 404 });
  }
}
