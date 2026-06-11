import { cn } from "@/lib/utils";

export function PageHeader({
  breadcrumb,
  title,
  description,
  actions,
  className,
}: {
  breadcrumb?: string[];
  title: string;
  description?: string;
  actions?: React.ReactNode;
  className?: string;
}) {
  return (
    <header className={cn("mb-6 flex flex-wrap items-end justify-between gap-4", className)}>
      <div>
        {breadcrumb && breadcrumb.length > 0 && (
          <nav aria-label="Breadcrumb">
            <p className="mb-1 font-mono text-[10px] tracking-[0.22em] text-text-muted">
              {breadcrumb.join(" / ").toUpperCase()}
            </p>
          </nav>
        )}
        <h1 className="font-display text-2xl font-black tracking-[0.06em] text-text-primary">
          {title}
        </h1>
        {description && (
          <p className="mt-1 max-w-prose text-sm font-light text-text-secondary">
            {description}
          </p>
        )}
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </header>
  );
}
