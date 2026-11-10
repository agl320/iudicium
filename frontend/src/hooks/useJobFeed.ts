import { useCallback, useEffect, useRef, useState } from "react";
import { fetchJobsPage, PAGE_SIZE } from "../api/jobs";
import type { JobPosting } from "../types/jobs";

export type JobsRequest = {
  query: string;
  category: string | null;
};

type FeedState = {
  // The request these results belong to; while it differs from the current
  // request, a new first page is loading.
  forRequest: JobsRequest | null;
  jobs: JobPosting[];
  total: number | null;
  page: number;
  hasMore: boolean;
  loadingMore: boolean;
  error: string;
};

const INITIAL: FeedState = {
  forRequest: null,
  jobs: [],
  total: null,
  page: 0,
  hasMore: false,
  loadingMore: false,
  error: "",
};

/** Paged job feed: the first page loads on every new search/filter, later
 *  pages are appended by `loadMore` (driven by infinite scroll). Responses
 *  from an outdated search are ignored. */
export function useJobFeed(request: JobsRequest) {
  const [state, setState] = useState<FeedState>(INITIAL);
  const generation = useRef(0);
  const inFlight = useRef(false);

  useEffect(() => {
    const current = ++generation.current;
    inFlight.current = true;

    fetchJobsPage(request.query, request.category, 0)
      .then(({ jobs, total }) => {
        if (current !== generation.current) return;
        setState({
          ...INITIAL,
          forRequest: request,
          jobs,
          total,
          hasMore: jobs.length === PAGE_SIZE,
        });
      })
      .catch((err: unknown) => {
        if (current !== generation.current) return;
        setState({
          ...INITIAL,
          forRequest: request,
          error: err instanceof Error ? err.message : "Unknown error",
        });
      })
      .finally(() => {
        if (current === generation.current) inFlight.current = false;
      });
  }, [request]);

  const latest = useRef(state);
  useEffect(() => {
    latest.current = state;
  }, [state]);

  const loadMore = useCallback(() => {
    const prev = latest.current;
    if (inFlight.current || !prev.hasMore || prev.forRequest !== request || prev.loadingMore) {
      return;
    }
    const current = generation.current;
    const nextPage = prev.page + 1;
    inFlight.current = true;
    setState((s) => ({ ...s, loadingMore: true }));

    fetchJobsPage(request.query, request.category, nextPage)
      .then(({ jobs }) => {
        if (current !== generation.current) return;
        setState((s) => {
          // A job inserted between page loads shifts pages by one; drop
          // anything already shown.
          const seen = new Set(s.jobs.map((job) => job.id));
          return {
            ...s,
            jobs: [...s.jobs, ...jobs.filter((job) => !seen.has(job.id))],
            page: nextPage,
            hasMore: jobs.length === PAGE_SIZE,
            loadingMore: false,
          };
        });
      })
      .catch((err: unknown) => {
        if (current !== generation.current) return;
        setState((s) => ({
          ...s,
          loadingMore: false,
          error: err instanceof Error ? err.message : "Unknown error",
        }));
      })
      .finally(() => {
        if (current === generation.current) inFlight.current = false;
      });
  }, [request]);

  const loading = state.forRequest !== request;
  return { ...state, error: loading ? "" : state.error, loading, loadMore };
}
