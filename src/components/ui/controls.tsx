"use client";

import { motion } from "motion/react";
import { useId, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode, type Ref } from "react";

export function cn(...classes: Array<string | false | null | undefined>): string {
  return classes.filter(Boolean).join(" ");
}

type Variant = "primary" | "secondary" | "ghost" | "danger";
type Size = "sm" | "md" | "lg";

const VARIANTS: Record<Variant, string> = {
  primary: "bg-accent text-accent-ink hover:bg-accent-hover",
  secondary: "bg-panel text-ink hover:bg-panel-2 shadow-[inset_0_0_0_1px_var(--line-strong)]",
  ghost: "text-muted hover:text-ink hover:bg-ink/[0.06]",
  danger: "text-error hover:bg-error-soft",
};

const SIZES: Record<Size, string> = {
  sm: "h-8 px-3 text-[13px] gap-1.5",
  md: "h-9 px-3.5 text-sm gap-2",
  lg: "h-11 px-5 text-[15px] gap-2",
};

export function Spinner({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={cn("size-4 animate-spin", className)} aria-hidden>
      <circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" strokeOpacity="0.25" strokeWidth="3" />
      <path d="M21 12a9 9 0 0 0-9-9" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  icon?: ReactNode;
  ref?: Ref<HTMLButtonElement>;
};

export function Button({ variant = "secondary", size = "md", loading, icon, className, children, disabled, ...rest }: ButtonProps) {
  return (
    <button
      type="button"
      {...rest}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={cn(
        "inline-flex shrink-0 select-none items-center justify-center rounded-[6px] font-medium whitespace-nowrap",
        "transition-[transform,background-color,color,box-shadow] duration-150 ease-out active:scale-[0.97]",
        "disabled:pointer-events-none disabled:opacity-50",
        VARIANTS[variant],
        SIZES[size],
        className,
      )}
    >
      {loading ? <Spinner /> : icon}
      {children}
    </button>
  );
}

export function IconButton({ label, children, className, ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { label: string }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      {...rest}
      className={cn(
        "inline-flex size-8 items-center justify-center rounded-[6px] text-muted transition-[transform,background-color,color] duration-150",
        "hover:bg-ink/[0.06] hover:text-ink active:scale-[0.94] disabled:opacity-40",
        className,
      )}
    >
      {children}
    </button>
  );
}

export function Input({ className, ref, ...rest }: InputHTMLAttributes<HTMLInputElement> & { ref?: Ref<HTMLInputElement> }) {
  return (
    <input
      ref={ref}
      {...rest}
      className={cn(
        "h-10 w-full rounded-[6px] bg-panel-2 px-3 text-[15px] text-ink outline-none transition-shadow duration-150",
        "shadow-[inset_0_0_0_1px_var(--line-strong)] placeholder:text-faint",
        "focus:shadow-[inset_0_0_0_2px_var(--accent)] aria-[invalid=true]:shadow-[inset_0_0_0_2px_var(--error)]",
        className,
      )}
    />
  );
}

export function Field({
  label,
  hint,
  error,
  children,
  className,
}: {
  label: string;
  hint?: ReactNode;
  error?: string | null;
  children: (props: { id: string; "aria-describedby"?: string; "aria-invalid"?: boolean }) => ReactNode;
  className?: string;
}) {
  const id = useId();
  const describedBy = error ? `${id}-error` : hint ? `${id}-hint` : undefined;
  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <label htmlFor={id} className="text-sm font-medium text-ink">
        {label}
      </label>
      {children({ id, "aria-describedby": describedBy, "aria-invalid": error ? true : undefined })}
      {error ? (
        <p id={`${id}-error`} className="text-[13px] text-error" role="alert">
          {error}
        </p>
      ) : hint ? (
        <p id={`${id}-hint`} className="text-[13px] text-muted">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

export type SegmentOption<T extends string> = { value: T; label: string; hint?: string };

export function Segmented<T extends string>({
  name,
  value,
  options,
  onChange,
  label,
  size = "md",
}: {
  name: string;
  value: T;
  options: SegmentOption<T>[];
  onChange: (value: T) => void;
  label: string;
  size?: "sm" | "md";
}) {
  const layoutId = useId();
  return (
    <div role="radiogroup" aria-label={label} className="inline-flex rounded-[8px] bg-surface p-1">
      {options.map((opt) => {
        const active = opt.value === value;
        return (
          <label
            key={opt.value}
            title={opt.hint}
            className={cn(
              "relative cursor-pointer select-none rounded-[6px] font-medium transition-colors duration-150",
              size === "sm" ? "px-2.5 py-1 text-[13px]" : "px-3.5 py-1.5 text-sm",
              active ? "text-ink" : "text-muted hover:text-ink",
            )}
          >
            <input
              type="radio"
              name={name}
              value={opt.value}
              checked={active}
              onChange={() => onChange(opt.value)}
              className="peer absolute inset-0 cursor-pointer opacity-0"
            />
            {active && (
              <motion.span
                layoutId={layoutId}
                className="pointer-events-none absolute inset-0 rounded-[6px] bg-panel-2 shadow-[0_1px_2px_rgb(0_0_0/0.08)]"
                transition={{ type: "spring", bounce: 0.15, duration: 0.35 }}
              />
            )}
            <span className="pointer-events-none relative rounded-[4px] peer-focus-visible:outline-2 peer-focus-visible:outline-offset-4 peer-focus-visible:outline-accent">
              {opt.label}
            </span>
          </label>
        );
      })}
    </div>
  );
}

export function Switch({
  checked,
  onChange,
  label,
  description,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
  description?: string;
}) {
  const id = useId();
  return (
    <div className="flex items-start justify-between gap-4">
      <div className="min-w-0">
        <label htmlFor={id} className="text-sm font-medium text-ink">
          {label}
        </label>
        {description && <p className="mt-0.5 text-[13px] text-muted">{description}</p>}
      </div>
      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={cn(
          "relative mt-0.5 h-6 w-10 shrink-0 rounded-full transition-colors duration-200",
          checked ? "bg-accent" : "bg-line-strong",
        )}
      >
        <motion.span
          className="absolute top-0.5 left-0.5 size-5 rounded-full bg-white shadow-[0_1px_3px_rgb(0_0_0/0.25)]"
          animate={{ x: checked ? 16 : 0 }}
          transition={{ type: "spring", bounce: 0.25, duration: 0.3 }}
        />
      </button>
    </div>
  );
}

export function Kbd({ children }: { children: ReactNode }) {
  return (
    <kbd className="inline-flex h-5 min-w-5 items-center justify-center rounded-[4px] bg-surface px-1 font-sans text-[11.5px] font-medium text-muted shadow-[inset_0_-1px_0_var(--line-strong)]">
      {children}
    </kbd>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("breathe rounded-[6px] bg-surface", className)} aria-hidden />;
}
