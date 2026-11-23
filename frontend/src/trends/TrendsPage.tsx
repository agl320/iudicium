// #/trends: when companies post. "Posted" = the day the poller first saw a
// posting (`first_seen`); each company's first day is skipped by default since
// that is the bulk import of everything already open.

import { type ReactNode, useCallback, useEffect, useMemo, useState } from "react";
import { cachedTrends, type DailyCounts, loadTrends } from "../api/trends";
import { SiteFooter, SiteHeader } from "../components/SiteHeader";
import { BRAND_FILL, SlidingTabs, type SlidingTabOption } from "../components/SlidingTabs";
import { CATEGORIES } from "../utils/categories";
import { type Series, useWidth } from "./chartUtils";
import { Bars, Heatmap, RankBars } from "./charts";

type Bin = "day" | "week" | "month";
type View = "total" | "track" | "company" | "multi";
type Range = "30" | "90" | "180" | "all" | "custom";
type Track = "all" | "tech_intern" | "hr" | "none";

const PAL = ["#e11d74", "#2a6fdb", "#17a398", "#f97316", "#8e5ea2", "#6b8e23", "#d1495b", "#00798c", "#edae49", "#66a182", "#7d4e57", "#3d5a80"];
const TRACKS = [
  { key: "tech_intern", label: "Tech intern", color: "#0BBEFE" },
  { key: "hr", label: "HR / Payroll", color: "#EC4899" },
  { key: "", label: "Untracked", color: "#cbd5e1" },
];
const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const ROLL: Record<Bin, number> = { day: 7, week: 4, month: 3 };
const ROLL_LABEL: Record<Bin, string> = { day: "7-day average", week: "4-week average", month: "3-month average" };

const opt = <K,>(key: K, label: string, fill = BRAND_FILL): SlidingTabOption<K> => ({ key, label, fill });
const BIN_OPTS = [opt<Bin>("day", "Day"), opt<Bin>("week", "Week"), opt<Bin>("month", "Month")];
const RANGE_OPTS = [opt<Range>("30", "30d"), opt<Range>("90", "90d"), opt<Range>("180", "6m"), opt<Range>("all", "All")];
const TRACK_OPTS = [
  opt<Track>("all", "All"),
  ...CATEGORIES.map((c) => opt<Track>(c.key, c.label, c.fill)),
  opt<Track>("none", "Untracked", "linear-gradient(120deg,#94a3b8,#64748b)"),
];
const VIEW_OPTS = [
  opt<View>("total", "Total"),
  opt<View>("track", "By track"),
  opt<View>("company", "By company"),
  opt<View>("multi", "Per company"),
];

const toDate = (s: string) => new Date(`${s}T00:00:00Z`);
const iso = (d: Date) => d.toISOString().slice(0, 10);
const addDays = (s: string, n: number) => {
  const d = toDate(s);
  d.setUTCDate(d.getUTCDate() + n);
  return iso(d);
};
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const short = (s: string) => `${MONTHS[+s.slice(5, 7) - 1]} ${+s.slice(8, 10)}`;
const binLabel = (bin: Bin) => (k: string) => (bin === "month" ? `${MONTHS[+k.slice(5, 7) - 1]} ${k.slice(2, 4)}` : short(k));
const binTitle = (bin: Bin, k: string) =>
  bin === "month" ? `${MONTHS[+k.slice(5, 7) - 1]} ${k.slice(0, 4)}` : bin === "week" ? `Week of ${short(k)}` : `${short(k)}, ${k.slice(0, 4)}`;

function binKey(day: string, bin: Bin): string {
  if (bin === "day") return day;
  if (bin === "month") return day.slice(0, 7);
  const d = toDate(day);
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
  return iso(d);
}

function ago(ms: number): string {
  const m = Math.round((Date.now() - ms) / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  return h < 48 ? `${h} h ago` : `${Math.round(h / 24)} days ago`;
}

function Card({ title, sub, action, children }: { title: string; sub?: ReactNode; action?: ReactNode; children: ReactNode }) {
  return (
    <section className="min-w-0 border border-line bg-paper shadow-soft">
      <div className="flex flex-wrap items-start justify-between gap-3 px-5 pt-4">
        <div className="min-w-0">
          <h2 className="text-[15px] font-semibold">{title}</h2>
          {sub ? <p className="mt-0.5 text-xs leading-relaxed text-neutral-500">{sub}</p> : null}
        </div>
        {action}
      </div>
      <div className="px-5 pt-3 pb-5">{children}</div>
    </section>
  );
}

function Stat({ label, value, sub, tone }: { label: string; value: ReactNode; sub?: ReactNode; tone?: "up" | "down" }) {
  return (
    <div className="border border-line bg-paper px-4 py-3 shadow-soft">
      <div className="label">{label}</div>
      <div className="mt-1 text-2xl font-semibold tabular-nums tracking-tight">{value}</div>
      {sub ? (
        <div className={`mt-0.5 text-xs ${tone === "up" ? "text-emerald-600" : tone === "down" ? "text-red-600" : "text-neutral-500"}`}>{sub}</div>
      ) : null}
    </div>
  );
}

function Legend({ items }: { items: { color: string; label: string; kind?: "bar" | "line" | "hatch" | "dot" }[] }) {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-neutral-500">
      {items.map((it) => (
        <span key={it.label} className="inline-flex items-center gap-1.5">
          {it.kind === "line" ? (
            <span className="inline-block h-0.5 w-4 rounded" style={{ background: it.color }} />
          ) : it.kind === "hatch" ? (
            <span className="inline-block size-3 rounded-sm border border-line" style={{ background: "repeating-linear-gradient(45deg,#e5e7eb 0 2px,transparent 2px 5px)" }} />
          ) : it.kind === "dot" ? (
            <span className="inline-block size-2 rounded-full" style={{ background: it.color }} />
          ) : (
            <span className="inline-block size-2.5 rounded-sm" style={{ background: it.color }} />
          )}
          {it.label}
        </span>
      ))}
    </div>
  );
}

type Tip = { x: number; y: number; body: ReactNode } | null;

export default function TrendsPage() {
  const [data, setData] = useState(cachedTrends);
  const by: DailyCounts = useMemo(() => data?.by ?? {}, [data]);
  const lastSeen = useMemo(() => data?.lastSeen ?? {}, [data]);
  const [loading, setLoading] = useState(true);
  const [progress, setProgress] = useState<[number, number]>([0, 0]);
  const [error, setError] = useState("");

  const [bin, setBin] = useState<Bin>("week");
  const [range, setRange] = useState<Range>("all");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [track, setTrack] = useState<Track>("all");
  const [view, setView] = useState<View>("total");
  const [skipFirst, setSkipFirst] = useState(true);
  const [cum, setCum] = useState(false);
  const [shared, setShared] = useState(false);
  const [perRow, setPerRow] = useState(true);
  const [sel, setSel] = useState<Set<string> | null>(null); // null = all
  const [q, setQ] = useState("");
  const [showDropped, setShowDropped] = useState(false);
  const [masked, setMasked] = useState<Set<string>>(new Set());
  const [tip, setTip] = useState<Tip>(null);
  const [mainRef, mainW] = useWidth<HTMLDivElement>();
  const [heatRef, heatW] = useWidth<HTMLDivElement>();
  const [dowRef, dowW] = useWidth<HTMLDivElement>();

  const run = useCallback((full: boolean) => {
    loadTrends({ full, onProgress: (a, b) => setProgress([a, b]) })
      .then(setData)
      .catch((e) => setError(e instanceof Error ? e.message : String(e)))
      .finally(() => setLoading(false));
  }, []);
  const refresh = (full: boolean) => {
    setLoading(true);
    setError("");
    setProgress([0, 0]);
    run(full);
  };
  // `loading` starts true, so the first load needs no state reset.
  useEffect(() => run(false), [run]);

  // ---- Static facts about the dataset ------------------------------------
  const first = useMemo(() => Object.fromEntries(Object.entries(by).map(([c, d]) => [c, Object.keys(d).sort()[0]])), [by]);
  const allDays = useMemo(() => [...new Set(Object.values(by).flatMap((d) => Object.keys(d)))].sort(), [by]);
  const ran = useMemo(() => new Set(allDays), [allDays]); // days the poller stored anything
  const minDay = allDays[0] ?? "";
  const maxDay = allDays[allDays.length - 1] ?? "";

  // Dropped: last_seen more than 2 days older than the median company's.
  const stopped = useMemo(() => {
    const days = Object.values(lastSeen).map((v) => v.slice(0, 10)).sort();
    if (!days.length) return {} as Record<string, string>;
    const cut = addDays(days[Math.floor(days.length / 2)], -2);
    return Object.fromEntries(
      Object.entries(lastSeen)
        .filter(([, v]) => v.slice(0, 10) < cut)
        .map(([c, v]) => [c, v.slice(0, 10)]),
    );
  }, [lastSeen]);

  const count = useCallback(
    (c: string, d: string) => {
      const cell = by[c]?.[d];
      if (!cell || masked.has(d) || (skipFirst && d === first[c])) return 0;
      if (track === "all") return Object.values(cell).reduce((a, b) => a + b, 0);
      return cell[track === "none" ? "" : track] ?? 0;
    },
    [by, masked, skipFirst, first, track],
  );

  const lifetime = useMemo(
    () => Object.fromEntries(Object.keys(by).map((c) => [c, Object.keys(by[c]).reduce((a, d) => a + count(c, d), 0)])),
    [by, count],
  );
  const comps = useMemo(() => Object.keys(by).sort((a, b) => lifetime[b] - lifetime[a]), [by, lifetime]);
  const color = useMemo(() => Object.fromEntries(comps.map((c, i) => [c, PAL[i % PAL.length]])), [comps]);
  const selected = useMemo(() => sel ?? new Set(comps), [sel, comps]);
  const picked = useMemo(() => comps.filter((c) => selected.has(c)), [comps, selected]);

  // ---- Range and per-day matrix ------------------------------------------
  const hi = range === "custom" ? to || maxDay : maxDay;
  const lo =
    range === "all" ? minDay : range === "custom" ? from || minDay : [addDays(maxDay, 1 - Number(range)), minDay].sort()[1] ?? minDay;

  const days = useMemo(() => {
    const out: string[] = [];
    if (!lo || !hi) return out;
    for (let d = lo; d <= hi; d = addDays(d, 1)) out.push(d);
    return out;
  }, [lo, hi]);

  // daily[company][dayIndex], tracks[trackKey][dayIndex] (selected companies only)
  const { daily, tracks } = useMemo(() => {
    const daily: Record<string, number[]> = {};
    const tracks: Record<string, number[]> = Object.fromEntries(TRACKS.map((t) => [t.key, days.map(() => 0)]));
    for (const c of picked) {
      daily[c] = days.map((d) => count(c, d));
      days.forEach((d, i) => {
        const cell = by[c]?.[d];
        if (!cell || masked.has(d) || (skipFirst && d === first[c])) return;
        for (const t of TRACKS) {
          if (track !== "all" && (track === "none" ? "" : track) !== t.key) continue;
          tracks[t.key][i] += cell[t.key] ?? 0;
        }
      });
    }
    return { daily, tracks };
  }, [picked, days, count, by, masked, skipFirst, first, track]);
  const dayTotal = useMemo(() => days.map((_, i) => picked.reduce((a, c) => a + daily[c][i], 0)), [days, picked, daily]);

  // ---- Binning ---------------------------------------------------------------
  const { ax, dayBin } = useMemo(() => {
    const ax: string[] = [];
    const dayBin: number[] = [];
    for (const d of days) {
      const k = binKey(d, bin);
      if (ax[ax.length - 1] !== k) ax.push(k);
      dayBin.push(ax.length - 1);
    }
    return { ax, dayBin };
  }, [days, bin]);

  const binOf = useCallback(
    (v: number[]) => {
      const out = ax.map(() => 0);
      v.forEach((n, i) => (out[dayBin[i]] += n));
      if (cum) for (let i = 1; i < out.length; i++) out[i] += out[i - 1];
      return out;
    },
    [ax, dayBin, cum],
  );

  const gaps = useMemo(() => {
    const has = ax.map(() => false);
    days.forEach((d, i) => {
      if (ran.has(d)) has[dayBin[i]] = true;
    });
    return has.map((h) => !h);
  }, [ax, days, dayBin, ran]);

  const binDays = useMemo(() => {
    const n = ax.map(() => 0);
    dayBin.forEach((b) => n[b]++);
    return n;
  }, [ax, dayBin]);
  const fullBin = bin === "day" ? 1 : bin === "week" ? 7 : 28;

  const totalSeries: Series = useMemo(() => ({ key: "total", name: "Postings", color: "#e11d74", v: binOf(dayTotal) }), [binOf, dayTotal]);
  const companySeries: Series[] = useMemo(
    () => picked.map((c) => ({ key: c, name: c, color: color[c], v: binOf(daily[c]) })),
    [picked, color, binOf, daily],
  );
  const trackSeries: Series[] = useMemo(
    () => TRACKS.map((t) => ({ key: t.key || "none", name: t.label, color: t.color, v: binOf(tracks[t.key]) })).filter((s) => s.v.some(Boolean)),
    [binOf, tracks],
  );

  // Trailing average over bins the poller actually ran in.
  const rolling = useMemo(() => {
    if (cum) return undefined;
    const w = ROLL[bin];
    const v = totalSeries.v;
    return v.map((_, i) => {
      if (gaps[i]) return null;
      const win: number[] = [];
      for (let j = i; j >= 0 && win.length < w; j--) if (!gaps[j]) win.push(v[j]);
      return win.length < Math.min(w, 2) ? null : win.reduce((a, b) => a + b, 0) / win.length;
    });
  }, [cum, bin, totalSeries, gaps]);

  const droppedInView = useMemo(
    () => picked.filter((c) => stopped[c] && stopped[c] >= lo && stopped[c] <= hi),
    [picked, stopped, lo, hi],
  );
  const markers = useMemo(() => {
    const m = new Map<number, string[]>();
    for (const c of droppedInView) {
      const i = dayBin[days.indexOf(stopped[c])];
      if (i != null) m.set(i, [...(m.get(i) ?? []), c]);
    }
    return m;
  }, [droppedInView, dayBin, days, stopped]);

  // ---- Summary numbers ----------------------------------------------------------
  const total = dayTotal.reduce((a, b) => a + b, 0);
  const ranInRange = days.filter((d) => ran.has(d) && !masked.has(d)).length;
  const sumDays = (a: number, b: number) => dayTotal.slice(Math.max(0, a), Math.max(0, b)).reduce((x, y) => x + y, 0);
  const last7 = sumDays(days.length - 7, days.length);
  const prev7 = sumDays(days.length - 14, days.length - 7);
  const wow = prev7 ? Math.round(((last7 - prev7) / prev7) * 100) : null;
  const polled = comps.filter((c) => !stopped[c]).length;

  const weekday = useMemo(() => {
    const sum = Array(7).fill(0);
    const n = Array(7).fill(0);
    days.forEach((d, i) => {
      if (!ran.has(d) || masked.has(d)) return;
      const w = (toDate(d).getUTCDay() + 6) % 7;
      sum[w] += dayTotal[i];
      n[w]++;
    });
    return sum.map((s, i) => (n[i] ? s / n[i] : 0));
  }, [days, ran, masked, dayTotal]);

  const ranked = useMemo(
    () =>
      picked
        .map((c) => ({ c, n: daily[c].reduce((a, b) => a + b, 0) }))
        .filter((x) => x.n > 0)
        .sort((a, b) => b.n - a.n),
    [picked, daily],
  );

  const heatBin: Bin = bin === "day" ? "week" : bin;
  const heat = useMemo(() => {
    const hax: string[] = [];
    const idx: number[] = [];
    for (const d of days) {
      const k = binKey(d, heatBin);
      if (hax[hax.length - 1] !== k) hax.push(k);
      idx.push(hax.length - 1);
    }
    const rows = ranked.slice(0, 20).map(({ c }) => {
      const v = hax.map(() => 0);
      daily[c].forEach((n, i) => (v[idx[i]] += n));
      const s = stopped[c] && stopped[c] <= hi ? days.indexOf(stopped[c]) : -1;
      return { name: c, v, stopFrom: s >= 0 ? idx[s] + 1 : stopped[c] && stopped[c] < lo ? 0 : undefined };
    });
    return { hax, rows };
  }, [days, heatBin, ranked, daily, stopped, hi, lo]);

  const momentum = useMemo(() => {
    if (days.length < 56) return null;
    const n = days.length;
    const rows = picked
      .filter((c) => !stopped[c] || stopped[c] >= hi)
      .map((c) => {
        const recent = daily[c].slice(n - 28).reduce((a, b) => a + b, 0);
        const prior = daily[c].slice(n - 56, n - 28).reduce((a, b) => a + b, 0);
        return { c, recent, prior, diff: recent - prior };
      });
    return {
      up: rows.filter((r) => r.diff > 0).sort((a, b) => b.diff - a.diff).slice(0, 6),
      down: rows.filter((r) => r.diff < 0).sort((a, b) => a.diff - b.diff).slice(0, 6),
      from: days[n - 28],
    };
  }, [days, picked, stopped, hi, daily]);

  // ---- Interaction --------------------------------------------------------------
  const showTip = (e: React.MouseEvent | undefined, body: ReactNode) => (e ? setTip({ x: e.clientX, y: e.clientY, body }) : setTip(null));
  const isMasked = (i: number) => days.some((d, j) => dayBin[j] === i && masked.has(d));

  function barTip(i: number | null, e: React.MouseEvent | undefined, detail: Series[], clickable: boolean) {
    if (i == null) return setTip(null);
    const items = detail.filter((s) => s.v[i]).sort((a, b) => b.v[i] - a.v[i]);
    const sum = items.reduce((a, s) => a + s.v[i], 0);
    const roll = rolling?.[i];
    showTip(
      e,
      <>
        <div className="flex items-baseline justify-between gap-4">
          <b>{binTitle(bin, ax[i])}</b>
          <span className="tabular-nums">{sum.toLocaleString()}</span>
        </div>
        {gaps[i] ? <div className="text-neutral-500">No data: poller was not running</div> : null}
        {!gaps[i] && binDays[i] < fullBin && bin !== "day" ? <div className="text-neutral-500">Partial {bin} ({binDays[i]} days)</div> : null}
        {roll != null && view === "total" && detail.length > 1 ? <div className="text-neutral-500">{ROLL_LABEL[bin]}: {Math.round(roll).toLocaleString()}</div> : null}
        {items.length > 1 ? (
          <div className="mt-1 space-y-0.5">
            {items.slice(0, 8).map((s) => (
              <div key={s.key} className="flex items-center gap-1.5">
                <span className="inline-block size-2 shrink-0 rounded-sm" style={{ background: s.color }} />
                <span className="truncate">{s.name}</span>
                <span className="ml-auto pl-3 tabular-nums">{s.v[i].toLocaleString()}</span>
              </div>
            ))}
            {items.length > 8 ? <div className="text-neutral-500">+{items.length - 8} more</div> : null}
          </div>
        ) : null}
        {clickable ? <div className="mt-1 text-[11px] text-neutral-400">Click to {isMasked(i) ? "unmask" : "mask"} this {bin}</div> : null}
      </>,
    );
  }

  function toggleMask(i: number) {
    const ds = days.filter((_, j) => dayBin[j] === i);
    setMasked((m) => {
      const next = new Set(m);
      const on = ds.some((d) => next.has(d));
      for (const d of ds) {
        if (on) next.delete(d);
        else next.add(d);
      }
      return next;
    });
  }

  function exportCsv() {
    const s = view === "track" ? trackSeries : view === "total" ? [totalSeries] : companySeries;
    const t = `${bin},${s.map((x) => `"${x.name}"`).join(",")}\n${ax.map((k, i) => `${k},${s.map((x) => x.v[i]).join(",")}`).join("\n")}`;
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([t], { type: "text/csv" }));
    a.download = `postings_${bin}_${lo}_${hi}.csv`;
    a.click();
  }

  const toggle = (c: string, on: boolean) => {
    const n = new Set(selected);
    if (on) n.add(c);
    else n.delete(c);
    setSel(n);
  };
  const live = comps.filter((c) => !stopped[c]);
  const dropped = comps.filter((c) => stopped[c]).sort((a, b) => stopped[b].localeCompare(stopped[a]));
  const match = (c: string) => c.toLowerCase().includes(q.toLowerCase());
  const companyRow = (c: string) => (
    <label key={c} className="flex cursor-pointer items-center gap-2 rounded px-1.5 py-1 text-sm hover:bg-wash">
      <input type="checkbox" className="accent-[#e11d74]" checked={selected.has(c)} onChange={(e) => toggle(c, e.target.checked)} />
      <span className="inline-block size-2 shrink-0 rounded-full" style={{ background: color[c] }} />
      <span className={`truncate ${stopped[c] ? "text-neutral-500" : ""}`}>{c}</span>
      <span className="ml-auto shrink-0 text-xs tabular-nums text-neutral-400">
        {stopped[c] ? short(stopped[c]) : lifetime[c].toLocaleString()}
      </span>
    </label>
  );

  const cols = Math.max(1, Math.floor(mainW / 260));
  const cellW = Math.floor((mainW - 20 * (cols - 1)) / cols);
  const multiMax = shared ? Math.max(1, ...companySeries.flatMap((s) => s.v)) : undefined;
  const mainSeries = view === "track" ? trackSeries : view === "company" ? companySeries : [totalSeries];
  const markerList = [...markers.entries()].map(([i, names]) => ({ i, count: names.length }));
  const ready = allDays.length > 0;

  return (
    <div className="flex min-h-screen flex-col">
      <SiteHeader />

      <main className="mx-auto w-full max-w-6xl flex-1 px-4">
        {/* Controls, sticky under the header like the job board's search bar. */}
        <div className="sticky top-[var(--header-h)] z-20 -mx-4 flex flex-wrap items-center gap-2 border-b border-line bg-paper/80 px-4 py-3 backdrop-blur-md">
          <SlidingTabs label="Range" options={RANGE_OPTS} value={range === "custom" ? ("all" as Range) : range} onChange={setRange} />
          <SlidingTabs label="Group by" options={BIN_OPTS} value={bin} onChange={setBin} />
          <SlidingTabs label="Track" options={TRACK_OPTS} value={track} onChange={setTrack} />
        </div>

        <div className="flex flex-wrap items-end justify-between gap-3 pt-6 pb-4">
          <div>
            <h1 className="text-xl font-semibold tracking-tight">Posting trends</h1>
            <p className="mt-1 text-sm text-neutral-500">
              {ready ? (
                <>
                  {short(lo)} – {short(hi)}, {hi.slice(0, 4)} ·{" "}
                  {picked.length === comps.length ? "all companies" : `${picked.length} of ${comps.length} companies`}
                  {track !== "all" ? ` · ${TRACK_OPTS.find((t) => t.key === track)?.label}` : ""}
                </>
              ) : (
                "When companies post, by the day the poller first saw each posting."
              )}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-xs text-neutral-500">          
            <button
              type="button"
              className="chip !h-8 !text-xs"
              aria-selected={!skipFirst}
              onClick={() => setSkipFirst((v) => !v)}
              title="Each company's first day is the bulk import of everything already open"
            >
              Include first-day imports
            </button>
            <button type="button" className="chip !h-8 !text-xs" aria-selected={cum} onClick={() => setCum((v) => !v)}>
              Cumulative
            </button>
            <span className="mx-1 h-5 w-px bg-line" aria-hidden="true" />
            <input
              type="date"
              aria-label="From"
              className="field !h-8 !w-auto !px-2 !text-xs"
              value={lo}
              min={minDay}
              max={hi}
              onChange={(e) => {
                setRange("custom");
                setFrom(e.target.value);
                setTo(hi);
              }}
            />
            <span>–</span>
            <input
              type="date"
              aria-label="To"
              className="field !h-8 !w-auto !px-2 !text-xs"
              value={hi}
              min={lo}
              max={maxDay}
              onChange={(e) => {
                setRange("custom");
                setFrom(lo);
                setTo(e.target.value);
              }}
            />
            <span className="ml-2 hidden sm:inline">
              {loading
                ? `Syncing… ${progress[0].toLocaleString()}${progress[1] ? ` / ${progress[1].toLocaleString()}` : ""}`
                : data
                  ? `Synced ${ago(data.savedAt)}`
                  : ""}
            </span>
            <button
              type="button"
              className="btn btn-sm"
              disabled={loading}
              onClick={(e) => refresh(e.shiftKey)}
              title="Fetch new postings. Shift-click to rebuild from scratch."
            >
              Refresh
            </button>
          </div>
        </div>

        {error ? <p className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p> : null}

        {/* KPIs */}
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Stat label="Postings" value={total.toLocaleString()} sub={skipFirst ? "first-day imports excluded" : "including first-day imports"} />
          <Stat label="Per day" value={ranInRange ? Math.round(total / ranInRange).toLocaleString() : "—"} sub={`average over ${ranInRange} polled days`} />
          <Stat
            label="Last 7 days"
            value={last7.toLocaleString()}
            sub={wow == null ? "no prior week" : `${wow >= 0 ? "+" : ""}${wow}% vs previous 7`}
            tone={wow == null ? undefined : wow >= 0 ? "up" : "down"}
          />
          <Stat label="Companies polled" value={`${polled} / ${comps.length}`} sub={`${comps.length - polled} no longer polled`} />
        </div>

        <div className="mt-4 grid gap-4 pb-10 lg:grid-cols-[15rem_minmax(0,1fr)]">
          {/* Company picker */}
          <aside className="self-start border border-line bg-paper shadow-soft lg:sticky lg:top-[calc(var(--header-h)+5rem)]">
            <div className="space-y-2 border-b border-line p-3">
              <input className="field !h-9 !text-sm" placeholder="Filter companies" value={q} onChange={(e) => setQ(e.target.value)} />
              <div className="flex flex-wrap gap-1">
                <button type="button" className="btn btn-xs" onClick={() => setSel(null)}>
                  All
                </button>
                <button type="button" className="btn btn-xs" onClick={() => setSel(new Set(live))}>
                  Polled
                </button>
                <button type="button" className="btn btn-xs" onClick={() => setSel(new Set(comps.slice(0, 10)))}>
                  Top 10
                </button>
                <button type="button" className="btn btn-xs" onClick={() => setSel(new Set())}>
                  None
                </button>
              </div>
            </div>
            <div className="max-h-[60vh] overflow-auto p-1.5">
              {live.filter(match).map(companyRow)}
              {dropped.length ? (
                <div className="mt-1 border-t border-line pt-1">
                  <button
                    type="button"
                    className="flex w-full items-center justify-between rounded px-1.5 py-1.5 text-left text-xs font-medium text-neutral-500 hover:bg-wash"
                    onClick={() => setShowDropped((v) => !v)}
                  >
                    <span>No longer polled · {dropped.length}</span>
                    <span>{showDropped || q ? "▾" : "▸"}</span>
                  </button>
                  {showDropped || q ? (
                    <>
                      <p className="px-1.5 pb-1 text-[11px] leading-snug text-neutral-400">Date is the last time the poller saw the board; zeros after it are expected.</p>
                      {dropped.filter(match).map(companyRow)}
                    </>
                  ) : null}
                </div>
              ) : null}
            </div>
          </aside>

          <div className="min-w-0 space-y-4">
            {/* Main time series */}
            <Card
              title="Postings over time"
              sub={view === "multi" ? "Own scale per company; hatched = no longer polled." : cum ? "Running total." : "Click a bar to mask it, e.g. a backfill spike."}
              action={
                <div className="flex items-center gap-1">
                  <SlidingTabs label="View" options={VIEW_OPTS} value={view} onChange={setView} />
                  <button type="button" className="btn btn-sm btn-ghost" onClick={exportCsv} title="Download the current series as CSV">
                    CSV
                  </button>
                </div>
              }
            >
              <div className="mb-3 flex min-h-7 flex-wrap items-center justify-between gap-2">
                {view === "multi" ? (
                  <button type="button" className="chip !h-7 !text-xs" aria-selected={shared} onClick={() => setShared((v) => !v)}>
                    Shared y-axis
                  </button>
                ) : (
                  <Legend
                    items={[
                      ...(view === "total"
                        ? [{ color: "#e11d74", label: "Postings" }]
                        : view === "track"
                          ? trackSeries.map((s) => ({ color: s.color, label: s.name }))
                          : []),
                      ...(view === "total" && rolling ? [{ color: "#0f172a", label: ROLL_LABEL[bin], kind: "line" as const }] : []),
                      ...(gaps.some(Boolean) ? [{ color: "", label: "Poller down", kind: "hatch" as const }] : []),
                      ...(markerList.length ? [{ color: "#9ca3af", label: "Company dropped (hover)", kind: "dot" as const }] : []),
                    ]}
                  />
                )}
                {masked.size ? (
                  <div className="flex items-center gap-2 text-xs text-neutral-500">
                    {masked.size} masked {masked.size === 1 ? "day" : "days"}
                    <button type="button" className="tag hover:bg-hl" onClick={() => setMasked(new Set())}>
                      Clear ✕
                    </button>
                  </div>
                ) : null}
              </div>

              <div ref={mainRef}>
                {!ready ? (
                  <div className="flex h-[360px] items-center justify-center text-sm text-neutral-400">{loading ? "Loading postings…" : "No data"}</div>
                ) : view === "multi" ? (
                  <div className="grid gap-x-5 gap-y-5" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0,1fr))` }}>
                    {companySeries.map((s) => {
                      const st = stopped[s.name];
                      const sIdx = st && st <= hi ? (st < lo ? 0 : dayBin[days.indexOf(st)] + 1) : undefined;
                      return (
                        <div key={s.key} className="min-w-0">
                          <div className="mb-1 flex items-center gap-2 text-xs">
                            <span className="inline-block size-2 shrink-0 rounded-full" style={{ background: s.color }} />
                            <span className="truncate font-medium">{s.name}</span>
                            <span className="tabular-nums text-neutral-400">
                              {(cum ? s.v[s.v.length - 1] ?? 0 : s.v.reduce((a, b) => a + b, 0)).toLocaleString()}
                            </span>
                            {st ? <span className="ml-auto shrink-0 text-[10px] text-neutral-400">dropped {short(st)}</span> : null}
                          </div>
                          <Bars
                            ax={ax}
                            label={binLabel(bin)}
                            series={[s]}
                            width={cellW}
                            height={110}
                            small
                            ymax={multiMax}
                            stopFrom={sIdx}
                            gaps={gaps}
                            onHover={(i, e) => barTip(i, e, [s], false)}
                          />
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <Bars
                    ax={ax}
                    label={binLabel(bin)}
                    series={mainSeries}
                    line={view === "total" ? rolling : undefined}
                    gaps={gaps}
                    markers={markerList}
                    width={mainW}
                    height={360}
                    onHover={(i, e) => barTip(i, e, view === "track" ? trackSeries : companySeries, !cum)}
                    onPick={cum ? undefined : toggleMask}
                    onMarker={(i, e) =>
                      i == null
                        ? setTip(null)
                        : showTip(
                            e,
                            <>
                              <b>Stopped being polled</b>
                              {(markers.get(i) ?? []).map((c) => (
                                <div key={c} className="flex justify-between gap-4">
                                  <span>{c}</span>
                                  <span className="text-neutral-500">{short(stopped[c])}</span>
                                </div>
                              ))}
                            </>,
                          )
                    }
                  />
                )}
              </div>
            </Card>

            <div className="grid gap-4 md:grid-cols-2">
              <Card title="Day of week" sub="Average postings per polled day; shows which days boards publish on.">
                <div ref={dowRef}>
                  <Bars
                    ax={WEEKDAYS}
                    label={(k) => k}
                    series={[{ key: "dow", name: "Avg / day", color: "#e11d74", v: weekday.map((x) => Math.round(x * 10) / 10) }]}
                    width={dowW}
                    height={210}
                    onHover={(i, e) =>
                      i == null ? setTip(null) : showTip(e, <><b>{WEEKDAYS[i]}</b> · {weekday[i].toFixed(1)} postings per day on average</>)
                    }
                  />
                </div>
              </Card>

              <Card title="Top companies" sub="Postings in the selected range and share of the total.">
                <RankBars
                  items={ranked.slice(0, 10).map(({ c, n }) => ({
                    key: c,
                    name: c,
                    value: n,
                    color: color[c],
                    note: `${n.toLocaleString()} · ${total ? Math.round((n / total) * 100) : 0}%`,
                  }))}
                />
              </Card>
            </div>

            <Card
              title="Activity heatmap"
              sub={`Top ${heat.rows.length} companies by ${heatBin}. ${
                perRow ? `Shaded against each company's own busiest ${heatBin}, so small boards' rhythms show too.` : "Shaded on one scale across companies."
              }`}
              action={
                <button type="button" className="chip !h-7 !text-xs" aria-selected={!perRow} onClick={() => setPerRow((v) => !v)}>
                  Shared scale
                </button>
              }
            >
              <div ref={heatRef}>
                <Heatmap
                  ax={heat.hax}
                  label={binLabel(heatBin)}
                  rows={heat.rows}
                  width={heatW}
                  perRow={perRow}
                  onHover={(cell, e) => {
                    if (!cell) return setTip(null);
                    const r = heat.rows[cell.r];
                    showTip(
                      e,
                      <>
                        <b>{r.name}</b> · {binTitle(heatBin, heat.hax[cell.i])}
                        <div className="tabular-nums">{r.v[cell.i].toLocaleString()} postings</div>
                        {r.stopFrom != null && cell.i >= r.stopFrom ? <div className="text-neutral-500">No longer polled</div> : null}
                      </>,
                    );
                  }}
                />
              </div>
            </Card>

            <Card
              title="Momentum"
              sub={
                momentum
                  ? `Last 4 weeks (since ${short(momentum.from)}) vs the 4 weeks before. Dropped companies are left out.`
                  : "Pick a range of at least 8 weeks."
              }
            >
              {momentum ? (
                <div className="grid gap-6 md:grid-cols-2">
                  <div>
                    <div className="label mb-2">Posting more</div>
                    <RankBars
                      empty="No company is up"
                      items={momentum.up.map((r) => ({
                        key: r.c,
                        name: r.c,
                        value: r.diff,
                        color: "#10b981",
                        note: `+${r.diff} · ${r.prior ? `+${Math.round((r.diff / r.prior) * 100)}%` : "new"}`,
                      }))}
                    />
                  </div>
                  <div>
                    <div className="label mb-2">Posting less</div>
                    <RankBars
                      empty="No company is down"
                      items={momentum.down.map((r) => ({
                        key: r.c,
                        name: r.c,
                        value: r.diff,
                        color: "#94a3b8",
                        note: `${r.diff} · ${Math.round((r.diff / r.prior) * 100)}%`,
                      }))}
                    />
                  </div>
                </div>
              ) : null}
            </Card>
          </div>
        </div>
      </main>

      {tip ? (
        <div
          className="pointer-events-none fixed z-50 max-w-64 rounded-lg border border-line bg-paper/95 px-3 py-2 text-xs shadow-soft backdrop-blur"
          style={{ left: Math.min(tip.x + 14, window.innerWidth - 270), top: tip.y + 14 }}
        >
          {tip.body}
        </div>
      ) : null}
      <SiteFooter />
    </div>
  );
}
