import { type ButtonHTMLAttributes, type ReactNode, useLayoutEffect, useRef } from "react";

export function Label({ children }: { children: ReactNode }) {
  return <span className="label mb-1 block">{children}</span>;
}

export function TextInput({
  label,
  value,
  onChange,
  placeholder,
  autoFocus,
}: {
  label?: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  autoFocus?: boolean;
}) {
  return (
    <label className="block">
      {label ? <Label>{label}</Label> : null}
      <input
        className="field h-9 text-sm"
        value={value}
        placeholder={placeholder}
        autoFocus={autoFocus}
        onChange={(event) => onChange(event.target.value)}
      />
    </label>
  );
}

/** Grows with its content. */
export function TextArea({
  value,
  onChange,
  placeholder,
  autoFocus,
  muted,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  autoFocus?: boolean;
  muted?: boolean;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);
  useLayoutEffect(() => {
    const node = ref.current;
    if (!node) return;
    node.style.height = "0px";
    node.style.height = `${node.scrollHeight + 4}px`;
  }, [value]);
  return (
    <textarea
      ref={ref}
      rows={1}
      className={`field block h-auto resize-none py-1.5 text-sm leading-snug ${
        muted ? "border-dashed bg-wash text-neutral-600" : ""
      }`}
      value={value}
      placeholder={placeholder}
      autoFocus={autoFocus}
      onChange={(event) => onChange(event.target.value)}
    />
  );
}

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  // page = onto the page (green), pool = to/from the pool (blue),
  // accent = swap / add structure (magenta), remove = delete (red).
  variant?: "primary" | "secondary" | "ghost" | "danger" | "page" | "pool" | "accent" | "remove";
  size?: "sm" | "xs";
  icon?: IconName;
};

export function Button({ variant = "secondary", size = "sm", className = "", icon, children, ...props }: ButtonProps) {
  const variants = {
    primary: "btn-primary",
    secondary: "",
    ghost: "btn-ghost",
    danger: "btn-danger",
    page: "btn-tint btn-page",
    pool: "btn-tint btn-pool",
    accent: "btn-tint btn-accent-soft",
    remove: "btn-tint btn-remove",
  };
  const sizes = { sm: "btn-sm", xs: "btn-xs" };
  return (
    <button type="button" className={`btn ${sizes[size]} ${variants[variant]} ${className}`} {...props}>
      {icon ? <Icon name={icon} /> : null}
      {children}
    </button>
  );
}

export type IconName = "up" | "down" | "swap" | "plus" | "trash" | "x";

const ICON_PATHS: Record<IconName, string> = {
  up: "M8 12.5V3.5M4 7.5l4-4 4 4",
  down: "M8 3.5v9M4 8.5l4 4 4-4",
  swap: "M3 5.5h9.5M10 3l2.5 2.5L10 8M13 10.5H3.5M6 8l-2.5 2.5L6 13",
  plus: "M8 3.5v9M3.5 8h9",
  trash: "M3 4.5h10M6.5 4.5V3h3v1.5M4.5 4.5l.6 8.5h5.8l.6-8.5",
  x: "M4.5 4.5l7 7M11.5 4.5l-7 7",
};

export function Icon({ name }: { name: IconName }) {
  return (
    <svg viewBox="0 0 16 16" className="size-3.5 shrink-0" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={ICON_PATHS[name]} />
    </svg>
  );
}

export function PanelSection({ title, action, children }: { title: string; action?: ReactNode; children: ReactNode }) {
  return (
    <section className="space-y-3 border-b border-line px-4 py-4 last:border-b-0">
      <div className="flex items-center justify-between gap-2">
        <h3 className="label">{title}</h3>
        {action}
      </div>
      {children}
    </section>
  );
}
