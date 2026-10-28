import type { ReactNode } from "react";
import { Label } from "./label";
import { cn } from "../../lib/utils";

export function FormField({
  label,
  error,
  children,
  className,
}: {
  label: string;
  error?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("space-y-1.5", className)}>
      <div className="flex min-h-[2.25rem] items-end">
        <Label className="leading-snug">{label}</Label>
      </div>
      {children}
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}
