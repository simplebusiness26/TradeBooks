'use server';

import { revalidatePath } from 'next/cache';
import { db } from '@/db/client';
import { requirePermissionStrict } from '@/lib/auth-context';
import { failure, runAction, success, type ActionState } from '@/lib/action-result';
import { prepareCisPeriod, recordCisFiled } from '@/domain/cis';
import { isIsoDate } from '@/lib/dates';

export async function prepareCisAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return runAction(async () => {
    const context = await requirePermissionStrict('periods.prepare');
    const start = String(formData.get('start') ?? '');
    const end = String(formData.get('end') ?? '');
    if (!isIsoDate(start) || !isIsoDate(end)) return failure('That period is not valid.');

    await prepareCisPeriod(db, context.company.id, start, end, context.user.userId);
    revalidatePath('/subcontractors');
    return success('Period prepared and locked for review. It has not been filed with HMRC.');
  });
}

export async function markCisFiledAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return runAction(async () => {
    const context = await requirePermissionStrict('periods.close');
    const start = String(formData.get('start') ?? '');
    const end = String(formData.get('end') ?? '');
    const reference = String(formData.get('reference') ?? '').trim();
    if (!isIsoDate(start) || !isIsoDate(end)) return failure('That period is not valid.');
    if (reference.length < 3) return failure('Enter the HMRC submission reference.');

    await recordCisFiled(db, context.company.id, start, end, reference, context.user.userId);
    revalidatePath('/subcontractors');
    return success('Recorded as filed. TradeBooks did not submit it — you or your accountant did.');
  });
}
