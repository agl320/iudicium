import { useLayoutEffect, useRef, useState } from "react";

export type FormatOption<K extends string> = { key: K; label: string; title?: string };

type Rect = { left: number; width: number };

const FILL = "linear-gradient(120deg, #e3277a 0%, #f2594a 60%, #f97a2a 100%)";
// Leading edge moves fast, trailing edge follows (same feel as the jobs filter).
const FAST = "220ms cubic-bezier(0.3, 0.7, 0.2, 1)";
const SLOW = "380ms cubic-bezier(0.3, 0.7, 0.2, 1)";
// The fill is a pill: its window reaches PAD px past the button on every side
// (half the row gap) so a fully rounded end still covers the button's own
// 8px corners when it settles, and travels as a round bubble in between.
const PAD = 4;
const ROUND = 999;

/**
 * A row of buttons sharing one gradient fill that lives *inside* them: a
 * gradient copy of every button sits on top of the real ones and is clipped to
 * a moving pill, so the colour slides from button to button (skipping the
 * gaps) and each label turns from ink to white exactly where the fill covers
 * it. Rests on the selected option; follows hover/focus.
 */
export function FormatPicker<K extends string>({
  options,
  value,
  onChange,
  label,
}: {
  options: FormatOption<K>[];
  value: K;
  onChange: (value: K) => void;
  label: string;
}) {
  const root = useRef<HTMLDivElement>(null);
  const buttons = useRef<(HTMLButtonElement | null)[]>([]);
  const [rects, setRects] = useState<Rect[]>([]);
  const [width, setWidth] = useState(0);
  const [hover, setHover] = useState<number | null>(null);
  const [direction, setDirection] = useState<"left" | "right">("right");

  const selected = Math.max(0, options.findIndex((option) => option.key === value));
  const target = hover ?? selected;

  useLayoutEffect(() => {
    const node = root.current;
    if (!node) return;
    const measure = () => {
      setWidth(node.clientWidth);
      setRects(buttons.current.map((b) => (b ? { left: b.offsetLeft, width: b.offsetWidth } : { left: 0, width: 0 })));
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    buttons.current.forEach((b) => b && observer.observe(b));
    return () => observer.disconnect();
  }, [options.length]);

  function moveTo(next: number | null) {
    const to = next ?? selected;
    if (to !== target) setDirection(to > target ? "right" : "left");
    setHover(next);
  }

  const rect = rects[target];
  const ready = rect && width > 0;
  // Each edge is its own clip so the two can move at different speeds.
  const leftEdge = ready ? rect.left - PAD : 0;
  const rightEdge = ready ? width - rect.left - rect.width - PAD : 0;
  const leftSpeed = direction === "right" ? SLOW : FAST;
  const rightSpeed = direction === "right" ? FAST : SLOW;

  return (
    <div
      ref={root}
      role="radiogroup"
      aria-label={label}
      className="relative flex items-center gap-2"
      onMouseLeave={() => moveTo(null)}
    >
      {options.map((option, index) => (
        <button
          key={option.key}
          ref={(node) => {
            buttons.current[index] = node;
          }}
          type="button"
          role="radio"
          aria-checked={index === selected}
          title={option.title}
          onClick={() => {
            moveTo(index);
            onChange(option.key);
          }}
          onMouseEnter={() => moveTo(index)}
          onFocus={() => moveTo(index)}
          onBlur={() => moveTo(null)}
          className="btn btn-sm rb-fill-btn"
        >
          {option.label}
        </button>
      ))}

      {ready ? (
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0"
          // Negative insets push the unused corners out of the way.
          style={{
            clipPath: `inset(-${PAD}px -60px -${PAD}px ${leftEdge}px round ${ROUND}px)`,
            transition: `clip-path ${leftSpeed}`,
          }}
        >
          <div
            className="absolute inset-0"
            style={{
              clipPath: `inset(-${PAD}px ${rightEdge}px -${PAD}px -60px round ${ROUND}px)`,
              transition: `clip-path ${rightSpeed}`,
            }}
          >
            {options.map((option, index) => {
              const r = rects[index];
              if (!r) return null;
              return (
                <span
                  key={option.key}
                  className="btn btn-sm rb-fill-copy absolute top-1/2 -translate-y-1/2"
                  style={{
                    left: r.left,
                    width: r.width,
                    // One gradient spanning the whole row, so it reads as a single fill.
                    backgroundImage: FILL,
                    backgroundSize: `${width}px 100%`,
                    backgroundPosition: `${-r.left}px 0`,
                  }}
                >
                  {option.label}
                </span>
              );
            })}
          </div>
        </div>
      ) : null}
    </div>
  );
}
