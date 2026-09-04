"use client";

export type AvatarStackUser = {
  id: string;
  name: string;
  secondary?: string;
  meta?: string;
  avatarUrl?: string | null;
};

/** Overlapping presence avatars with cap + "+N" overflow chip and a rich
 * hover tooltip per avatar. Decorative dots are tokenized (bg-success). */
export function AvatarStack({
  users,
  cap = 15,
  onClick,
  label,
}: {
  users: AvatarStackUser[];
  cap?: number;
  onClick?: () => void;
  label?: string;
}) {
  const shown = users.slice(0, cap);
  const overflow = users.length - shown.length;

  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label ?? `View ${users.length} online users`}
      className="flex items-center"
    >
      {shown.map((u, i) => (
        <div
          key={u.id}
          data-slot="avatar-stack-item"
          className="group/avatar relative"
          style={{ marginLeft: i === 0 ? 0 : -6, zIndex: shown.length - i }}
        >
          {u.avatarUrl ? (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img
              src={u.avatarUrl}
              alt={u.name}
              className="h-6 w-6 rounded-full object-cover ring-2 ring-bg-secondary"
            />
          ) : (
            <div className="flex h-6 w-6 items-center justify-center rounded-full bg-accent/20 text-[10px] font-bold text-accent ring-2 ring-bg-secondary">
              {u.name.charAt(0).toUpperCase()}
            </div>
          )}
          <span
            data-slot="presence-dot"
            aria-hidden="true"
            className="absolute bottom-0 right-0 h-1.5 w-1.5 rounded-full bg-success ring-1 ring-bg-secondary"
          />
          <div className="pointer-events-none absolute bottom-full left-1/2 z-50 mb-2 -translate-x-1/2 whitespace-nowrap rounded-sm border border-border bg-bg-primary px-2 py-1 text-xs opacity-0 transition-opacity group-hover/avatar:opacity-100">
            <div className="font-medium text-text-primary">{u.name}</div>
            {u.secondary && (
              <div className="text-text-muted">{u.secondary}</div>
            )}
            {u.meta && <div className="text-text-muted">{u.meta}</div>}
          </div>
        </div>
      ))}
      {overflow > 0 && (
        <div
          className="flex h-6 w-6 items-center justify-center rounded-full bg-bg-tertiary font-mono text-[9px] font-bold text-text-muted ring-2 ring-bg-secondary"
          style={{ marginLeft: -6, zIndex: 0 }}
        >
          +{overflow}
        </div>
      )}
    </button>
  );
}
