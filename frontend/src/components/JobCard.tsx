import { memo, useState } from "react";
import type { JobPosting } from "../types/jobs";
import { getCategory } from "../utils/categories";

type JobCardProps = {
  job: JobPosting;
  logoDevPublicKey: string;
  index: number;
};

function relativeDate(value: string): string {
  const date = new Date(value);
  const days = Math.floor((Date.now() - date.getTime()) / 86_400_000);
  if (Number.isNaN(days)) return "";
  if (days <= 0) return "Today";
  if (days === 1) return "Yesterday";
  if (days < 30) return `${days}d ago`;
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function Logo({ job, logoDevPublicKey }: { job: JobPosting; logoDevPublicKey: string }) {
  const [failed, setFailed] = useState(false);
  if (failed || !job.company_url || !logoDevPublicKey) {
    return (
      <span className="flex size-10 shrink-0 items-center justify-center rounded-lg border border-line bg-wash text-sm font-semibold text-neutral-500">
        {job.company.charAt(0)}
      </span>
    );
  }
  return (
    <img
      src={`https://img.logo.dev/${job.company_url}?token=${logoDevPublicKey}`}
      className="size-10 shrink-0 rounded-lg border border-line bg-paper object-contain p-1"
      alt=""
      loading="lazy"
      onError={() => setFailed(true)}
    />
  );
}

function PinIcon() {
  return (
    <svg viewBox="0 0 16 16" className="size-3.5 shrink-0" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
      <path d="M8 14s4.5-4.2 4.5-7.5a4.5 4.5 0 1 0-9 0C3.5 9.8 8 14 8 14Z" />
      <circle cx="8" cy="6.5" r="1.5" />
    </svg>
  );
}

/** Grid columns shared with the header row in JobList. */
export const ROW_GRID = "sm:grid sm:grid-cols-[2.5rem_minmax(0,1fr)_9.5rem_5.5rem] sm:items-center sm:gap-x-4";

// Memoized: appending a page re-renders the list, not every existing row.
export const JobCard = memo(function JobCard({ job, logoDevPublicKey }: JobCardProps) {
  const category = getCategory(job.category);
  const linked = job.url !== "";

  const tags = (
    <>
      {category ? (
        <span className={`inline-flex h-6 items-center rounded-md border px-2 text-xs font-medium ${category.badgeClassName}`}>
          {category.label}
        </span>
      ) : null}
      {job.salary ? (
        <span className="inline-flex h-6 items-center rounded-md border border-emerald-200 bg-emerald-50 px-2 text-xs font-medium text-emerald-700">
          {job.salary}
        </span>
      ) : null}
    </>
  );

  const body = (
    <>
      <Logo job={job} logoDevPublicKey={logoDevPublicKey} />
      <div className="min-w-0 flex-1">
        <h3 className="line-clamp-2 text-[15px] font-semibold leading-snug text-neutral-900 group-hover:text-accent-strong">
          {job.title}
        </h3>
        <p className="mt-1 flex min-w-0 items-center gap-1.5 text-sm">
          <span className="shrink-0 font-medium text-neutral-700">{job.company}</span>
          {job.location ? (
            <>
              <span className="text-neutral-300" aria-hidden="true">
                •
              </span>
              <span className="flex min-w-0 items-center gap-1 text-neutral-500" title={job.location}>
                <PinIcon />
                <span className="truncate">{job.location}</span>
              </span>
            </>
          ) : null}
        </p>
        {category || job.salary ? <div className="mt-2 flex flex-wrap gap-1.5 sm:hidden">{tags}</div> : null}
      </div>
      <div className="hidden flex-col items-start gap-1 sm:flex">{tags}</div>
      <div className="hidden items-center justify-end gap-2 text-sm text-neutral-500 sm:flex">
        <span title={new Date(job.first_seen).toLocaleString()}>{relativeDate(job.first_seen)}</span>
      </div>
    </>
  );

  const className = `job-card group flex items-start gap-3 border-b border-line px-3 py-3.5 transition-colors hover:bg-wash focus-visible:bg-wash focus-visible:outline-none ${ROW_GRID}`;

  return linked ? (
    <a href={job.url} target="_blank" rel="noreferrer" className={className}>
      {body}
    </a>
  ) : (
    <article className={className}>{body}</article>
  );
});
