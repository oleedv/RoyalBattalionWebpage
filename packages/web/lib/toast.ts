import { toast } from "sonner";

/**
 * Toast contract (design spec, Toasts section): the api-client guarantees
 * `error` is a displayable string, so toasts render it directly. The stable
 * machine codes below bypass toasts entirely — the protected layout renders
 * dedicated full-screen states for them.
 */
export const TOAST_BYPASS_CODES: ReadonlySet<string> = new Set([
  "ACCOUNT_DISABLED",
  "NOT_IN_GUILD",
]);

export function coerceErrorMessage(
  error: string | null | undefined,
  fallback = "Request failed",
): string | null {
  const message = error || fallback;
  return TOAST_BYPASS_CODES.has(message) ? null : message;
}

export function toastError(
  error: string | null | undefined,
  fallback?: string,
): void {
  const message = coerceErrorMessage(error, fallback);
  if (message) toast.error(message);
}

export function toastSuccess(message: string): void {
  toast.success(message);
}
