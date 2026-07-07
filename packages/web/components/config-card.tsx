import { cn } from "@/lib/utils";

/**
 * Feature-config card hosted on a content page (e.g. the birthday admin card
 * on /dashboard). Permission gating happens at the call site.
 */
export function ConfigCard({
  title,
  description,
  headerAction,
  footer,
  children,
  className,
}: {
  title: string;
  description?: string;
  headerAction?: React.ReactNode;
  footer?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("facet-border rounded-sm bg-bg-card p-5", className)}>
      <div className="mb-4 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="font-display text-sm font-semibold tracking-wide text-text-primary">
            {title}
          </h2>
          {description && (
            <p className="mt-0.5 text-xs text-text-muted">{description}</p>
          )}
        </div>
        {headerAction && <div className="shrink-0">{headerAction}</div>}
      </div>
      {children}
      {footer && <div className="mt-4 flex items-center gap-3">{footer}</div>}
    </section>
  );
}
