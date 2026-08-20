'use server';

import { revalidatePath } from 'next/cache';
import { db } from '@/db/client';
import { requirePermission } from '@/lib/auth-context';
import { failure, runAction, success, type ActionState } from '@/lib/action-result';
import { prepareVatPeriod, recordVatFiled } from '@/domain/vat-return';
import { isIsoDate } from '@/lib/dates';

export async function prepareVatAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return runAction(async () => {
    const context = await requirePermission('periods.prepare');
    const start = String(formData.get('start') ?? '');
    const end = String(formData.get('end') ?? '');
    if (!isIsoDate(start) || !isIsoDate(end)) return failure('That period is not valid.');

    await prepareVatPeriod(db, context.company.id, start, end, context.user.userId);
    revalidatePath('/vat');
    return success('Figures prepared and snapshotted for review. Nothing has been sent to HMRC.');
  });
}

export async function markVatFiledAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return runAction(async () => {
    const context = await requirePermission('periods.close');
    const start = String(formData.get('start') ?? '');
    const end = String(formData.get('end') ?? '');
    const reference = String(formData.get('reference') ?? '').trim();
    if (!isIsoDate(start) || !isIsoDate(end)) return failure('That period is not valid.');
    if (reference.length < 3) return failure('Enter the HMRC receipt reference.');

    await recordVatFiled(db, context.company.id, start, end, reference, context.user.userId);
    revalidatePath('/vat');
    return success('Recorded as filed with HMRC outside TradeBooks.');
  });
}
