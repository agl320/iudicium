// Small SVG/HTML chart primitives for the trends page. No chart library: the
// page only needs bars, a line, a heatmap and ranked bars.

import { type ReactNode, useId, useState } from "react";
import { niceMax } from "./chartUtils";

import type { Series } from "./chartUtils";

const fmtTick = (n: number) => (n >= 1000 ? `${+(n / 1000).toFixed(1)}k` : `${+n.toFixed(1)}`);

export function HatchDefs({ id, color = "#e5e7eb" }: { id: string; color?: string }) {
  return (
    <defs>
      <pattern id={id} width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
        <line x1="0" y1="0" x2="0" y2="6" stroke={color} strokeWidth="2" />
      </pattern>
    </defs>
  );
}

/**
 * Stacked vertical bars over a categorical axis, with optional overlay line,
 * hatched "no data" bins, a hatched region from `stopFrom` on, and marker dots
 * under the axis. Hover/click report the bin index.
 */
export function Bars({
  ax,
  label,
  series,
  line,
  gaps,
  markers,
  stopFrom,
  width,
  height,
  small,
  ymax,
  onHover,
  onPick,
  onMarker,
}: {
  ax: string[];
  label: (key: string) => string;
  series: Series[];
  line?: (number | null)[];
  gaps?: boolean[];
  markers?: { i: number; count: number }[];
  stopFrom?: number;
  width: number;
  height: number;
  small?: boolean;
  ymax?: number;
  onHover: (i: number | null, e?: React.MouseEvent) => void;
  onPick?: (i: number) => void;
  onMarker?: (i: number | null, e?: React.MouseEvent) => void;
}) {
  const hatch = useId();
  const [active, setActive] = useState<number | null>(null);
  if (width <= 0) return <div style={{ height }} />;
  const ml = small ? 30 : 40;
  const mr = 4;
  const mt = 6;
  const mb = (small ? 16 : 22) + (markers?.length ? 12 : 0);
  const pw = width - ml - mr;
  const ph = height - mt - mb;
  const n = Math.max(ax.length, 1);
  const bw = pw / n;
  const tops = ax.map((_, i) => series.reduce((a, s) => a + s.v[i], 0));
  const mx = niceMax(ymax ?? Math.max(1, ...tops, ...(line ?? []).map((x) => x ?? 0)));
  const step = n <= 12 ? 1 : Math.max(1, Math.ceil(n / (pw / (small ? 42 : 64))));
  const gap = bw > 6 ? bw * 0.18 : bw > 2 ? 1 : 0;
  const y = (v: number) => mt + ph - (ph * v) / mx;
  const ticks = small ? [0, 0.5, 1] : [0, 0.25, 0.5, 0.75, 1];

  let path = "";
  if (line) {
    let pen = false;
    line.forEach((v, i) => {
      if (v == null) {
        pen = false;
        return;
      }
      path += `${pen ? "L" : "M"}${ml + (i + 0.5) * bw},${y(v)}`;
      pen = true;
    });
  }

  return (
    <svg width={width} height={height} className="block select-none">
      <HatchDefs id={hatch} />
      {ticks.map((t) => (
        <g key={t}>
          <line x1={ml} x2={width - mr} y1={y(mx * t)} y2={y(mx * t)} stroke={t ? "#f1f3f6" : "#d4d7dd"} />
          <text x={ml - 6} y={y(mx * t) + 3} textAnchor="end" className="fill-neutral-400 text-[10px] tabular-nums">
            {fmtTick(mx * t)}
          </text>
        </g>
      ))}
      {gaps?.map((g, i) =>
        g ? <rect key={`g${i}`} x={ml + i * bw} y={mt} width={bw} height={ph} fill={`url(#${hatch})`} /> : null,
      )}
      {stopFrom != null && stopFrom < n ? (
        <rect x={ml + stopFrom * bw} y={mt} width={(n - stopFrom) * bw} height={ph} fill={`url(#${hatch})`} />
      ) : null}
      {active != null ? <rect x={ml + active * bw} y={mt} width={bw} height={ph} fill="#0f172a" opacity={0.04} /> : null}
      {ax.map((k, i) => {
        let y0 = mt + ph;
        return (
          <g key={k}>
            {series.map((s) => {
              const h = (ph * s.v[i]) / mx;
              if (h <= 0) return null;
              y0 -= h;
              return (
                <rect key={s.key} x={ml + i * bw + gap / 2} y={y0} width={Math.max(bw - gap, 0.8)} height={h} fill={s.color} />
              );
            })}
          </g>
        );
      })}
      {path ? <path d={path} fill="none" stroke="#0f172a" strokeWidth={1.5} strokeLinejoin="round" opacity={0.75} /> : null}
      {ax.map((k, i) =>
        i % step === 0 && (n <= 12 || ml + (i + 0.5) * bw < width - mr - 18) ? (
          <text
            key={`l${k}`}
            x={ml + (i + 0.5) * bw}
            y={height - 5}
            textAnchor="middle"
            className="fill-neutral-400 text-[10px]"
          >
            {label(k)}
          </text>
        ) : null,
      )}
      {markers?.map((m) => (
        <g
          key={`m${m.i}`}
          className="cursor-default"
          onMouseMove={(e) => onMarker?.(m.i, e)}
          onMouseLeave={() => onMarker?.(null)}
        >
          <rect x={ml + m.i * bw} y={mt + ph + 2} width={Math.max(bw, 10)} height={12} fill="transparent" />
          <circle cx={ml + (m.i + 0.5) * bw} cy={mt + ph + 8} r={m.count > 1 ? 3.5 : 2.5} fill="#9ca3af" />
        </g>
      ))}
      <rect
        x={ml}
        y={mt}
        width={pw}
        height={ph}
        fill="transparent"
        className={onPick ? "cursor-pointer" : ""}
        onMouseMove={(e) => {
          const box = e.currentTarget.getBoundingClientRect();
          const i = Math.min(n - 1, Math.max(0, Math.floor(((e.clientX - box.left) / box.width) * n)));
          setActive(i);
          onHover(i, e);
        }}
        onMouseLeave={() => {
          setActive(null);
          onHover(null);
        }}
        onClick={(e) => {
          if (!onPick) return;
          const box = e.currentTarget.getBoundingClientRect();
          onPick(Math.min(n - 1, Math.floor(((e.clientX - box.left) / box.width) * n)));
        }}
      />
    </svg>
  );
}

/** Rows × bins grid; colour = count relative to the row's (or the grid's) max. */
export function Heatmap({
  ax,
  label,
  rows,
  width,
  perRow,
  onHover,
}: {
  ax: string[];
  label: (key: string) => string;
  rows: { name: string; v: number[]; stopFrom?: number }[];
  width: number;
  perRow: boolean;
  onHover: (cell: { r: number; i: number } | null, e?: React.MouseEvent) => void;
}) {
  const hatch = useId();
  if (width <= 0) return null;
  const ml = 116;
  const cell = 18;
  const mt = 4;
  const mb = 20;
  const n = Math.max(ax.length, 1);
  const cw = (width - ml) / n;
  const gridMax = Math.max(1, ...rows.flatMap((r) => r.v));
  const step = Math.max(1, Math.ceil(n / ((width - ml) / 56)));
  const height = mt + rows.length * cell + mb;
  return (
    <svg width={width} height={height} className="block select-none" onMouseLeave={() => onHover(null)}>
      <HatchDefs id={hatch} />
      {rows.map((r, ri) => {
        const mx = perRow ? Math.max(1, ...r.v) : gridMax;
        const yy = mt + ri * cell;
        return (
          <g key={r.name}>
            <text x={ml - 8} y={yy + cell / 2 + 4} textAnchor="end" className="fill-neutral-600 text-[11px]">
              {r.name.length > 16 ? `${r.name.slice(0, 15)}…` : r.name}
            </text>
            {r.v.map((v, i) => {
              const stopped = r.stopFrom != null && i >= r.stopFrom;
              const t = Math.sqrt(v / mx);
              return (
                <rect
                  key={i}
                  x={ml + i * cw + 0.5}
                  y={yy + 1}
                  width={Math.max(cw - 1, 0.5)}
                  height={cell - 2}
                  rx={2}
                  fill={stopped && !v ? `url(#${hatch})` : v ? `rgb(225 29 116 / ${0.12 + 0.88 * t})` : "#f3f4f6"}
                  onMouseMove={(e) => onHover({ r: ri, i }, e)}
                />
              );
            })}
          </g>
        );
      })}
      {ax.map((k, i) =>
        i % step === 0 && ml + (i + 0.5) * cw < width - 18 ? (
          <text
            key={k}
            x={ml + (i + 0.5) * cw}
            y={height - 5}
            textAnchor="middle"
            className="fill-neutral-400 text-[10px]"
          >
            {label(k)}
          </text>
        ) : null,
      )}
    </svg>
  );
}

/** Ranked horizontal bars (HTML, so long names truncate cleanly). */
export function RankBars({
  items,
  max,
  empty,
}: {
  items: { key: string; name: ReactNode; value: number; color: string; note?: ReactNode }[];
  max?: number;
  empty?: string;
}) {
  if (!items.length) return <p className="py-6 text-center text-xs text-neutral-400">{empty ?? "Nothing to show"}</p>;
  const mx = max ?? Math.max(1, ...items.map((i) => Math.abs(i.value)));
  return (
    <ul className="space-y-2">
      {items.map((it) => (
        <li key={it.key} className="grid grid-cols-[minmax(0,7.5rem)_minmax(0,1fr)_auto] items-center gap-3 text-sm">
          <span className="truncate text-neutral-700">{it.name}</span>
          <span className="h-2 overflow-hidden rounded-full bg-wash">
            <span
              className="block h-full rounded-full"
              style={{ width: `${Math.max(2, (Math.abs(it.value) / mx) * 100)}%`, background: it.color }}
            />
          </span>
          <span className="text-right text-xs tabular-nums text-neutral-500">{it.note ?? it.value.toLocaleString()}</span>
        </li>
      ))}
    </ul>
  );
}
