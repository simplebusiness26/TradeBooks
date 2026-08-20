import { NextResponse } from 'next/server';
import { db } from '@/db/client';
import { requirePermissionOrThrow } from '@/lib/auth-context';
import { checkRateLimit, RATE_LIMITS } from '@/lib/rate-limit';
import {
  exportBillsCsv,
  exportCustomersCsv,
  exportInvoicesCsv,
  exportJobsCsv,
  exportJournalCsv,
  exportSuppliersCsv,
  exportTransactionsCsv,
  buildAccountantPack,
  buildExportBundle,
  type ExportFile,
} from '@/domain/exports';
import { getAccountingAdapter, type AccountingProvider } from '@/adapters/accounting';
import { isIsoDate } from '@/lib/dates';
import { AppError } from '@/lib/errors';

export const dynamic = 'force-dynamic';

const CSV_EXPORTS = {
  transactions: exportTransactionsCsv,
  invoices: exportInvoicesCsv,
  bills: exportBillsCsv,
  customers: exportCustomersCsv,
  suppliers: exportSuppliersCsv,
  jobs: exportJobsCsv,
  journal: exportJournalCsv,
} as const;

/**
 * Exports are the standalone escape hatch: everything TradeBooks holds can be
 * taken out as plain CSV, with no external service involved.
 */
export async function GET(request: Request, { params }: { params: Promise<{ kind: string }> }) {
  try {
    const context = await requirePermissionOrThrow('exports.run');
    checkRateLimit(`export:${context.company.id}`, RATE_LIMITS.export);

    const { kind } = await params;
    const url = new URL(request.url);
    const start = url.searchParams.get('start');
    const end = url.searchParams.get('end');
    const range = start && end && isIsoDate(start) && isIsoDate(end) ? { start, end } : undefined;

    if (kind in CSV_EXPORTS) {
      const file = await CSV_EXPORTS[kind as keyof typeof CSV_EXPORTS](db, context.company.id, range);
      return csvResponse(file);
    }

    if (kind === 'accountant-pack') {
      const files = await buildAccountantPack(db, context.company.id, range);
      // A single readable text bundle avoids a zip dependency and stays
      // copy-pastable into a spreadsheet.
      const body = files
        .map((file) => `===== ${file.filename} =====\n${file.content}`)
        .join('\n\n');
      return new NextResponse(body, {
        headers: {
          'content-type': 'text/plain; charset=utf-8',
          'content-disposition': `attachment; filename="tradebooks-accountant-pack.txt"`,
          'cache-control': 'private, no-store',
        },
      });
    }

    if (kind === 'xero' || kind === 'quickbooks' || kind === 'freeagent') {
      const bundle = await buildExportBundle(db, context.company.id, range);
      const adapter = getAccountingAdapter(kind as AccountingProvider);
      const mapped = adapter.map(bundle);
      return NextResponse.json(
        {
          provider: adapter.displayName,
          connected: adapter.configured,
          note: adapter.configured
            ? 'Credentials are configured. Records can be pushed once the connector is completed.'
            : 'Not connected. This is the mapped payload TradeBooks would send. See CONNECTIONS_REQUIRED.md section 5.',
          generatedAt: bundle.generatedAt,
          warnings: mapped.warnings,
          resources: mapped.resources,
        },
        {
          headers: {
            'content-disposition': `attachment; filename="tradebooks-${kind}.json"`,
            'cache-control': 'private, no-store',
          },
        },
      );
    }

    return NextResponse.json({ error: 'Unknown export' }, { status: 404 });
  } catch (error) {
    if (error instanceof AppError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error('[export] failed', error);
    return NextResponse.json({ error: 'That export could not be produced.' }, { status: 500 });
  }
}

function csvResponse(file: ExportFile): NextResponse {
  return new NextResponse(file.content, {
    headers: {
      'content-type': `${file.contentType}; charset=utf-8`,
      'content-disposition': `attachment; filename="tradebooks-${file.filename}"`,
      'cache-control': 'private, no-store',
    },
  });
}
