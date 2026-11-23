import { supabase } from "../lib/supabase";

/** Postings per company → calendar day (UTC, of `first_seen`) → track ("" = none) → count. */
export type DailyCounts = Record<string, Record<string, Record<string, number>>>;

/** `lastSeen`: newest `last_seen` per company. The poller refreshes it every
 *  run, so a stale value means the company is no longer being polled. */
export type TrendsData = { by: DailyCounts; watermark: string; savedAt: number; lastSeen: Record<string, string> };

const KEY = "iudicium.trends.v3";
const PAGE = 1000;
const PARALLEL = 6;

function readCache(): TrendsData | null {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as TrendsData) : null;
  } catch {
    return null;
  }
}

function writeCache(cache: TrendsData): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(cache));
  } catch {
    // Storage full or blocked: the page still works, it just refetches.
  }
}

export function cachedTrends(): TrendsData | null {
  return readCache();
}

type Row = { company: string; first_seen: string; category: string | null };

/**
 * Per-company daily posting counts by track. Only three columns are pulled,
 * aggregated in the browser and cached in localStorage; later loads fetch just
 * the rows newer than the last one seen. `full` discards the cache (picks up
 * postings deleted or re-categorised upstream).
 */
export async function loadTrends(
  opts: { full?: boolean; onProgress?: (rows: number, total: number) => void } = {},
): Promise<TrendsData> {
  const prior = opts.full ? null : readCache();
  const by: DailyCounts = prior ? structuredClone(prior.by) : {};
  let watermark = prior?.watermark ?? "";
  let rows = 0;

  const base = () => {
    const q = supabase.from("job_postings").select("company,first_seen,category", { count: "exact" });
    return prior ? q.gt("first_seen", prior.watermark) : q;
  };
  const head = await base().limit(1);
  if (head.error) throw new Error(`Failed to fetch trends: ${head.error.message}`);
  const total = head.count ?? 0;

  const fetchPage = async (from: number) => {
    const { data, error } = await base()
      .order("first_seen", { ascending: true })
      .order("id", { ascending: true })
      .range(from, from + PAGE - 1);
    if (error) throw new Error(`Failed to fetch trends: ${error.message}`);
    return (data ?? []) as Row[];
  };

  // Pages are independent (stable order), so pull several at once.
  const offsets = Array.from({ length: Math.ceil(total / PAGE) }, (_, i) => i * PAGE);
  for (let i = 0; i < offsets.length; i += PARALLEL) {
    const pages = await Promise.all(offsets.slice(i, i + PARALLEL).map(fetchPage));
    for (const data of pages) {
      for (const r of data) {
        const day = String(r.first_seen).slice(0, 10);
        const cats = ((by[r.company] ??= {})[day] ??= {});
        const cat = r.category ?? "";
        cats[cat] = (cats[cat] ?? 0) + 1;
        if (String(r.first_seen) > watermark) watermark = String(r.first_seen);
      }
      rows += data.length;
    }
    opts.onProgress?.(rows, total);
  }

  // last_seen changes on old rows, so it is re-read every load: one tiny
  // newest-first query per company, a dozen at a time.
  const lastSeen: Record<string, string> = prior?.lastSeen ? { ...prior.lastSeen } : {};
  const names = Object.keys(by);
  for (let i = 0; i < names.length; i += 12) {
    await Promise.all(
      names.slice(i, i + 12).map(async (name) => {
        const { data } = await supabase
          .from("job_postings")
          .select("last_seen")
          .eq("company", name)
          .order("last_seen", { ascending: false })
          .limit(1);
        if (data?.[0]?.last_seen) lastSeen[name] = String(data[0].last_seen);
      }),
    );
  }

  const cache = { by, watermark, savedAt: Date.now(), lastSeen };
  writeCache(cache);
  return cache;
}
