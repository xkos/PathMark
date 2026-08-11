import type { ButtonHTMLAttributes, PropsWithChildren } from "react";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "ghost";
  full?: boolean;
}

export function Button({
  children,
  variant = "primary",
  full = false,
  className = "",
  ...props
}: PropsWithChildren<ButtonProps>) {
  return (
    <button
      className={`button button--${variant}${full ? " button--full" : ""} ${className}`.trim()}
      {...props}
    >
      {children}
    </button>
  );
}
