import type { Metadata } from 'next';
import { requirePermission } from '@/lib/auth-context';
import { PageHeader } from '@/components/ui/page';
import { CustomerForm } from '@/components/forms/customer-form';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Add a customer — TradeBooks' };

export default async function NewCustomerPage() {
  await requirePermission('records.write');
  return (
    <div>
      <PageHeader backHref="/customers" backLabel="Customers" title="Add a customer" />
      <CustomerForm />
    </div>
  );
}
