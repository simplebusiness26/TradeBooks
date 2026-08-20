'use client';

import { useFormStatus } from 'react-dom';
import { Button, type ButtonVariant } from './primitives';

export function SubmitButton({
  children,
  pendingLabel,
  variant = 'primary',
  className,
  formAction,
}: {
  children: React.ReactNode;
  pendingLabel?: string;
  variant?: ButtonVariant;
  className?: string;
  formAction?: string | ((formData: FormData) => void | Promise<void>);
}) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant={variant} className={className} disabled={pending} formAction={formAction}>
      {pending ? (pendingLabel ?? 'Working…') : children}
    </Button>
  );
}
