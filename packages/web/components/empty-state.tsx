import Image from "next/image";
import { cn } from "@/lib/utils";

export function EmptyState({
  message,
  action,
  className,
  variant = "default",
}: {
  message: string;
  action?: React.ReactNode;
  className?: string;
  variant?: "default" | "hint";
}) {
  if (variant === "hint") {
    return (
      <p className={cn("font-mono text-xs text-text-muted", className)}>{message}</p>
    );
  }

  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center gap-3 py-14 text-center",
        className,
      )}
    >
      <Image
        src="/img/rb_newlion2024_4_RS.png"
        alt=""
        width={48}
        height={48}
        className="opacity-25 grayscale"
      />
      <p className="text-sm text-text-muted">{message}</p>
      {action}
    </div>
  );
}
