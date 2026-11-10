import type { ReactNode } from "react";
import { SiteHeader } from "../components/SiteHeader";

/** Centered page used by sign-in and account settings. */
export function Shell({ children, wide, wordmark }: { children: ReactNode; wide?: boolean; wordmark?: boolean }) {
  return (
    <div className="min-h-screen text-neutral-900">
      <SiteHeader wordmark={wordmark} />
      <main className={`mx-auto px-6 py-16 ${wide ? "max-w-2xl" : "max-w-sm"}`}>
        <div className="rb-panel-in">{children}</div>
      </main>
    </div>
  );
}

export function Card({ title, description, children }: { title: string; description?: string; children: ReactNode }) {
  return (
    <section className="border border-line bg-paper p-6 shadow-soft">
      <h2 className="text-[15px] font-semibold">{title}</h2>
      {description ? <p className="mt-1 text-xs leading-relaxed text-neutral-500">{description}</p> : null}
      <div className="mt-4 space-y-3">{children}</div>
    </section>
  );
}

export function Field({
  label,
  type = "text",
  value,
  onChange,
  autoComplete,
  autoFocus,
  placeholder,
}: {
  label: string;
  type?: string;
  value: string;
  onChange: (value: string) => void;
  autoComplete?: string;
  autoFocus?: boolean;
  placeholder?: string;
}) {
  return (
    <label className="block">
      <span className="label mb-1 block">{label}</span>
      <input
        type={type}
        value={value}
        autoComplete={autoComplete}
        autoFocus={autoFocus}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
        className="field"
      />
    </label>
  );
}

export function Message({ tone, children }: { tone: "error" | "info" | "success"; children: ReactNode }) {
  const tones = {
    error: "border-red-200 bg-red-50 text-red-700",
    info: "border-line bg-wash text-ink",
    success: "border-[#fbc7da] bg-hl text-accent-strong",
  };
  return <p className={`rb-panel-in rounded-lg border px-3 py-2 text-xs leading-relaxed ${tones[tone]}`}>{children}</p>;
}

export function SubmitButton({ children, busy, variant = "primary" }: { children: ReactNode; busy?: boolean; variant?: "primary" | "danger" }) {
  return (
    <button
      type="submit"
      disabled={busy}
      className={`btn w-full ${variant === "danger" ? "btn-danger" : "btn-primary"}`}
    >
      {busy ? "Please wait…" : children}
    </button>
  );
}
