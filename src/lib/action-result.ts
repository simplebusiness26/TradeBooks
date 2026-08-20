import { AppError, ValidationError } from '@/lib/errors';

/** The shape every server action returns, so forms can render errors uniformly. */
export type ActionState = {
  status: 'idle' | 'success' | 'error';
  message?: string;
  fieldErrors?: Record<string, string[]>;
  /** Arbitrary payload for the calling form, e.g. a created record id. */
  data?: Record<string, unknown>;
};

export const IDLE: ActionState = { status: 'idle' };

export function success(message?: string, data?: Record<string, unknown>): ActionState {
  return { status: 'success', message, data };
}

export function failure(message: string, fieldErrors?: Record<string, string[]>): ActionState {
  return { status: 'error', message, fieldErrors };
}

/**
 * Converts a thrown value into a safe result. Unexpected errors are logged
 * server-side and reported generically so internals never leak to the browser.
 */
export function toActionState(error: unknown): ActionState {
  if (error instanceof ValidationError) {
    return failure(error.message, error.fieldErrors);
  }
  if (error instanceof AppError) {
    return failure(error.message);
  }
  console.error('[action] unexpected error', error);
  return failure('Something went wrong. Please try again.');
}

/** Wraps an action body so every failure becomes a rendered message. */
export async function runAction(body: () => Promise<ActionState>): Promise<ActionState> {
  try {
    return await body();
  } catch (error) {
    // A Next.js redirect is signalled by throwing; let it through untouched.
    if (isRedirectError(error)) throw error;
    return toActionState(error);
  }
}

function isRedirectError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'digest' in error &&
    typeof (error as { digest: unknown }).digest === 'string' &&
    (error as { digest: string }).digest.startsWith('NEXT_REDIRECT')
  );
}
