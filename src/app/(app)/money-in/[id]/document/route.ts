import { NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { db } from '@/db/client';
import { companies, customers, invoiceLines, jobs } from '@/db/schema';
import { getAuthContext } from '@/lib/auth-context';
import { getInvoice } from '@/domain/invoices';
import { renderInvoiceHtml } from '@/domain/invoice-document';

export const dynamic = 'force-dynamic';

/** Serves a printable invoice. Tenant-scoped: the id alone grants nothing. */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const context = await getAuthContext();
  if (!context) return new NextResponse('Sign in to view this invoice.', { status: 401 });

  const { id } = await params;
  const invoice = await getInvoice(db, context.company.id, id).catch(() => null);
  if (!invoice) return new NextResponse('Not found', { status: 404 });

  const [companyRows, customerRows, lines, jobRows] = await Promise.all([
    db.select().from(companies).where(eq(companies.id, context.company.id)).limit(1),
    db.select().from(customers).where(eq(customers.id, invoice.customerId)).limit(1),
    db.select().from(invoiceLines).where(eq(invoiceLines.invoiceId, invoice.id)).orderBy(invoiceLines.position),
    invoice.jobId ? db.select().from(jobs).where(eq(jobs.id, invoice.jobId)).limit(1) : Promise.resolve([]),
  ]);

  const company = companyRows[0];
  const customer = customerRows[0];
  if (!company || !customer) return new NextResponse('Not found', { status: 404 });

  const html = renderInvoiceHtml({
    company,
    customer,
    invoice,
    lines,
    jobReference: jobRows[0]?.reference ?? null,
  });

  return new NextResponse(html, {
    headers: {
      'content-type': 'text/html; charset=utf-8',
      'cache-control': 'private, no-store',
    },
  });
}
