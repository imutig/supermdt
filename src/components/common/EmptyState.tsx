import type { ReactNode } from "react";
import { Clover } from "./Clover";

// Élément 5 du handoff : trèfle atténué + message rassurant, pour toute liste vide.
export function EmptyState({
  title,
  message,
  action,
  compact = false,
}: {
  title: string;
  message?: string;
  action?: ReactNode;
  compact?: boolean;
}) {
  return (
    <div className={`flex flex-col items-center justify-center gap-[10px] px-4 text-center mdt-reveal ${compact ? "py-8" : "py-14"}`}>
      <Clover color="var(--faint)" size={compact ? 28 : 34} opacity={0.55} />
      <div>
        <div className="text-[13px] font-semibold">{title}</div>
        {message && <div className="mt-[2px] text-[11.5px] text-muted">{message}</div>}
      </div>
      {action}
    </div>
  );
}
