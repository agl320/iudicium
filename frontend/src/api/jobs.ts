import { supabase } from "../lib/supabase";
import type { JobPosting } from "../types/jobs";

type BackendStatus = {
  last_updated_at: string | null;
};

export const PAGE_SIZE = 25;

export type JobsPage = {
  jobs: JobPosting[];
  // Total matching rows (for "x of y"), null if the count was unavailable.
  total: number | null;
};

// "*" rather than a column list so the page keeps working whether or not the
// backend has added newer columns (e.g. salary) yet.
const COLUMNS = "*";

export async function fetchJobsPage(
  query: string,
  category: string | null,
  page: number,
): Promise<JobsPage> {
  const from = page * PAGE_SIZE;
  let q = supabase
    .from("job_postings")
    .select(COLUMNS, { count: page === 0 ? "exact" : undefined })
    .order("first_seen", { ascending: false })
    .order("id", { ascending: false })
    .range(from, from + PAGE_SIZE - 1);

  if (category) {
    q = q.eq("category", category);
  }

  if (query.trim().length > 0) {
    const tokens = query
      .toLowerCase()
      .split(/\W+/)
      .filter((t) => t.length > 0);

    // Case-insensitive pattern matching
    for (const token of tokens) {
      q = q.ilike("title", `%${token}%`);
    }
  }

  const { data, error, count } = await q;
  if (error) {
    throw new Error(`Failed to fetch jobs: ${error.message}`);
  }

  return { jobs: (data || []) as JobPosting[], total: count ?? null };
}

export async function fetchBackendStatus(): Promise<BackendStatus> {
  const { data, error } = await supabase
    .from("job_postings")
    .select("last_seen", { count: "exact" })
    .order("last_seen", { ascending: false })
    .limit(1);

  if (error) {
    throw new Error(`Failed to fetch status: ${error.message}`);
  }

  const last_updated_at = data?.[0]?.last_seen || null;
  return { last_updated_at };
}
