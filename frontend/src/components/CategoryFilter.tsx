import { useEffect, useRef, useState } from "react";
import { CATEGORIES } from "../utils/categories";

type CategoryFilterProps = {
  value: string | null;
  onChange: (value: string | null) => void;
};

const OPTIONS: { key: string | null; label: string; fill: string }[] = [
  { key: null, label: "All", fill: "linear-gradient(120deg, #e3277a 0%, #f2594a 60%, #f97a2a 100%)" },
  ...CATEGORIES.map((category) => ({ key: category.key, label: category.label, fill: category.fill })),
];

type Rect = { left: number; width: number };

/**
 * Segmented control with one sliding block in the option's colour. The block
 * follows the hovered (or focused) option, stretching toward it (leading edge
 * first, trailing edge catching up), and returns to the selected option.
 */
export function CategoryFilter({ value, onChange }: CategoryFilterProps) {
  const root = useRef<HTMLDivElement>(null);
  const buttons = useRef<(HTMLButtonElement | null)[]>([]);
  const [rects, setRects] = useState<Rect[]>([]);
  const [width, setWidth] = useState(0);
  const [hover, setHover] = useState<number | null>(null);
  const [direction, setDirection] = useState<"left" | "right">("right");

  const selected = Math.max(0, OPTIONS.findIndex((option) => option.key === value));
  const target = hover ?? selected;

  // Measure option positions (and re-measure when fonts load or the layout changes).
  useEffect(() => {
    const node = root.current;
    if (!node) return;
    const measure = () => {
      setWidth(node.clientWidth);
      setRects(buttons.current.map((b) => (b ? { left: b.offsetLeft, width: b.offsetWidth } : { left: 0, width: 0 })));
    };
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    buttons.current.forEach((b) => b && observer.observe(b));
    return () => observer.disconnect();
  }, []);

  function moveTo(next: number | null) {
    const to = next ?? selected;
    if (to !== target) setDirection(to > target ? "right" : "left");
    setHover(next);
  }

  const rect = rects[target];
  // Leading edge moves fast, trailing edge follows: a short stretch-and-settle.
  const fast = "220ms cubic-bezier(0.3, 0.7, 0.2, 1)";
  const slow = "380ms cubic-bezier(0.3, 0.7, 0.2, 1)";
  const transition =
    direction === "right" ? `right ${fast}, left ${slow}, box-shadow 200ms` : `left ${fast}, right ${slow}, box-shadow 200ms`;

  return (
    <div
      ref={root}
      role="tablist"
      aria-label="Job type"
      onMouseLeave={() => moveTo(null)}
      className="surface-fade relative inline-flex h-10 shrink-0 items-stretch gap-1 rounded-lg border border-[#d4d7dd] p-1"
    >
      {rect ? (
        <span
          aria-hidden="true"
          className="pointer-events-none absolute top-1 bottom-1 overflow-hidden rounded-md"
          style={{
            left: rect.left,
            right: width - rect.left - rect.width,
            transition,
            boxShadow: "0 1px 2px rgb(15 23 42 / 0.15), inset 0 1px 0 rgb(255 255 255 / 0.2)",
          }}
        >
          {OPTIONS.map((option, index) => (
            <span
              key={option.key ?? "all"}
              className="absolute inset-0 transition-opacity duration-200"
              style={{ background: option.fill, opacity: index === target ? 1 : 0 }}
            />
          ))}
        </span>
      ) : null}
      {OPTIONS.map((option, index) => {
        const active = index === selected;
        // White label on whichever option the block is over (hovered or selected).
        const filled = index === target;
        return (
          <button
            key={option.key ?? "all"}
            ref={(node) => {
              buttons.current[index] = node;
            }}
            role="tab"
            type="button"
            aria-selected={active}
            onClick={() => {
              moveTo(index);
              onChange(option.key);
            }}
            onMouseEnter={() => moveTo(index)}
            onFocus={() => moveTo(index)}
            onBlur={() => moveTo(null)}
            // One font weight for every state, so the control never changes width.
            className={`relative z-10 inline-flex cursor-pointer items-center rounded-md px-3.5 text-sm font-semibold transition-colors duration-200 ${
              filled ? "text-white" : active ? "text-ink" : "text-neutral-500 hover:text-ink"
            }`}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
