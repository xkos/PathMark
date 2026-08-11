import type { PropsWithChildren } from "react";

interface BadgeProps {
  tone?: "neutral" | "success" | "warning" | "info";
}

export function Badge({ children, tone = "neutral" }: PropsWithChildren<BadgeProps>) {
  return <span className={`badge badge--${tone}`}>{children}</span>;
}
