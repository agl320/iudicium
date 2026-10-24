import type { JobPosting } from "../types/jobs";
import { JobCard } from "./JobCard";

type JobListProps = {
  jobs: JobPosting[];
  logoDevPublicKey: string;
  loading: boolean;
};

export function JobList({ jobs, logoDevPublicKey, loading }: JobListProps) {
  if (loading && jobs.length === 0) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 4 }, (_, index) => (
          <div
            key={index}
            className="h-[104px] animate-pulse rounded-lg border border-zinc-200 bg-zinc-100/60"
          />
        ))}
      </div>
    );
  }

  if (jobs.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-zinc-300 px-6 py-12 text-center text-sm text-zinc-500">
        No postings match this search.
      </div>
    );
  }

  return (
    <div className={`space-y-3 text-left ${loading ? "opacity-60" : ""}`}>
      {jobs.map((job, index) => (
        <JobCard
          key={job.id}
          job={job}
          logoDevPublicKey={logoDevPublicKey}
          index={index}
        />
      ))}
    </div>
  );
}
