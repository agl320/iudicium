import { useEffect, useRef } from "react";
import type { JobPosting } from "../types/jobs";
import { JobCard, ROW_GRID } from "./JobCard";

type JobListProps = {
  jobs: JobPosting[];
  logoDevPublicKey: string;
  loading: boolean;
  loadingMore: boolean;
  hasMore: boolean;
  onLoadMore: () => void;
};

function Skeletons({ count }: { count: number }) {
  return (
    <>
      {Array.from({ length: count }, (_, index) => (
        <div key={index} className="flex animate-pulse items-center gap-4 border-b border-line px-3 py-3">
          <div className="size-9 rounded-lg bg-wash" />
          <div className="flex-1 space-y-2">
            <div className="h-3.5 w-2/5 rounded bg-neutral-100" />
            <div className="h-3 w-1/4 rounded bg-neutral-100" />
          </div>
        </div>
      ))}
    </>
  );
}

export function JobList({ jobs, logoDevPublicKey, loading, loadingMore, hasMore, onLoadMore }: JobListProps) {
  const sentinel = useRef<HTMLDivElement>(null);

  // Load the next page shortly before the end of the list scrolls into view.
  useEffect(() => {
    const node = sentinel.current;
    if (!node || !hasMore) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) onLoadMore();
      },
      { rootMargin: "600px 0px" },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [hasMore, onLoadMore, jobs.length]);

  if (loading && jobs.length === 0) {
    return (
      <div className="border-t border-line">
        <Skeletons count={8} />
      </div>
    );
  }

  if (jobs.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-line px-6 py-16 text-center text-sm text-neutral-500">
        No postings match this search.
      </div>
    );
  }

  return (
    <div className={`border-t border-line transition-opacity ${loading ? "opacity-40" : ""}`}>
      <div className={`surface-fade hidden border-b border-line px-3 py-2 text-xs font-medium text-neutral-500 ${ROW_GRID}`}>
        <span />
        <span>Role</span>
        <span>Type</span>
        <span className="text-right">Posted</span>
      </div>
      {jobs.map((job, index) => (
        <JobCard key={job.id} job={job} logoDevPublicKey={logoDevPublicKey} index={index} />
      ))}
      {loadingMore ? <Skeletons count={3} /> : null}
      {hasMore ? (
        <div ref={sentinel} className="flex justify-center py-6">
          <button type="button" onClick={onLoadMore} disabled={loadingMore} className="btn">
            {loadingMore ? "Loading…" : "Load more"}
          </button>
        </div>
      ) : (
        <p className="py-6 text-center text-sm text-neutral-400">End of results</p>
      )}
    </div>
  );
}
