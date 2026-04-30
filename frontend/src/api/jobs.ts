import type { JobPosting } from "../types/jobs";

const BACKEND_API_URL = import.meta.env.VITE_BACKEND_API_URL;

export async function fetchRecentJobs(query: string): Promise<JobPosting[]> {
  const params = new URLSearchParams({
    limit: "100",
  });

  const normalizedQuery = query.trim();
  if (normalizedQuery.length > 0) {
    params.set("query", normalizedQuery);
  }

  const response = await fetch(
    `${BACKEND_API_URL}/jobs/recent?${params.toString()}`,
  );
  if (!response.ok) {
    throw new Error(`Request failed with status ${response.status}`);
  }

  return (await response.json()) as JobPosting[];
}
