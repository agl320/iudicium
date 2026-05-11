import type { JobPosting } from "../types/jobs";
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  throw new Error(
    "Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY in environment",
  );
}

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

type BackendStatus = {
  last_updated_at: string | null;
};

export async function fetchRecentJobs(query: string): Promise<JobPosting[]> {
  let q = supabase
    .from("job_postings")
    .select("*")
    .order("last_seen", { ascending: false })
    .limit(100);

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

  const { data, error } = await q;
  if (error) {
    throw new Error(`Failed to fetch jobs: ${error.message}`);
  }

  return (data || []) as JobPosting[];
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
