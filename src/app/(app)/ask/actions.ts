'use server';

import { revalidatePath } from 'next/cache';
import { db } from '@/db/client';
import { requirePermissionStrict } from '@/lib/auth-context';
import { failure, runAction, success, type ActionState } from '@/lib/action-result';
import { resolutionSchema, resolveException } from '@/domain/ask-me';
import { snoozeException } from '@/domain/exceptions';
import { addDays, todayIso } from '@/lib/dates';

export async function answerExceptionAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return runAction(async () => {
    const context = await requirePermissionStrict('exceptions.resolve');
    const exceptionId = String(formData.get('exceptionId') ?? '');

    const raw = formData.get('resolution');
    if (typeof raw !== 'string') return failure('Choose an answer.');

    let parsedJson: unknown;
    try {
      parsedJson = JSON.parse(raw);
    } catch {
      return failure('That answer could not be read.');
    }

    const resolution = resolutionSchema.safeParse(parsedJson);
    if (!resolution.success) return failure('That answer is not one we recognise.');

    const result = await resolveException(
      db,
      context.company.id,
      exceptionId,
      resolution.data,
      context.user.userId,
    );

    revalidatePath('/ask');
    revalidatePath('/home');
    revalidatePath('/money-out');
    revalidatePath('/receipts');

    return success(result.message, { ruleCreated: result.ruleCreated });
  });
}

export async function snoozeExceptionAction(formData: FormData): Promise<void> {
  const context = await requirePermissionStrict('exceptions.resolve');
  const exceptionId = String(formData.get('exceptionId') ?? '');
  const days = Number(formData.get('days') ?? 7);
  const until = new Date(`${addDays(todayIso(), Number.isFinite(days) ? days : 7)}T09:00:00Z`);
  await snoozeException(db, context.company.id, exceptionId, until, context.user.userId);
  revalidatePath('/ask');
  revalidatePath('/home');
}
