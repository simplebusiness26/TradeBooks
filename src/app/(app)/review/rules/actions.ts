'use server';

import { revalidatePath } from 'next/cache';
import { db } from '@/db/client';
import { requirePermission } from '@/lib/auth-context';
import { deleteRule, setRuleActive } from '@/domain/rules';

export async function toggleRuleAction(formData: FormData): Promise<void> {
  const context = await requirePermission('rules.manage');
  const ruleId = String(formData.get('ruleId') ?? '');
  const isActive = String(formData.get('isActive') ?? '') === 'yes';
  await setRuleActive(db, context.company.id, ruleId, isActive, context.user.userId);
  revalidatePath('/review/rules');
}

export async function deleteRuleAction(formData: FormData): Promise<void> {
  const context = await requirePermission('rules.manage');
  const ruleId = String(formData.get('ruleId') ?? '');
  await deleteRule(db, context.company.id, ruleId, context.user.userId);
  revalidatePath('/review/rules');
}
