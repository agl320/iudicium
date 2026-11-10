import { type ReactNode, useEffect, useRef, useState } from "react";

/** A button with a dropdown panel; closes on outside click or Escape. */
export function Popover({
  trigger,
  children,
  align = "left",
  width = "w-72",
}: {
  trigger: (open: boolean) => ReactNode;
  children: (close: () => void) => ReactNode;
  align?: "left" | "right";
  width?: string;
}) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (event: MouseEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={root} className="relative">
      <div onClick={() => setOpen((o) => !o)}>{trigger(open)}</div>
      {open ? (
        <div
          className={`rb-popover absolute top-full z-50 mt-1.5 ${width} ${
            align === "right" ? "right-0" : "left-0"
          } rounded-lg border border-neutral-200 bg-white p-1 shadow-soft border border-line`}
        >
          {children(() => setOpen(false))}
        </div>
      ) : null}
    </div>
  );
}
