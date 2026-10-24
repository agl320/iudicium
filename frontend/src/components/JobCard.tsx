import type { JobPosting } from "../types/jobs";
import { getCategory } from "../utils/categories";
import { formatDate, truncateText } from "../utils/jobs";

type JobCardProps = {
  job: JobPosting;
  logoDevPublicKey: string;
  index: number;
};

export function JobCard({ job, logoDevPublicKey, index }: JobCardProps) {
  const formattedDate = formatDate(job.first_seen);
  const category = getCategory(job.category);

  return (
    <article className="group flex gap-4 rounded-lg border border-zinc-200 bg-white p-4 shadow-xs transition-colors hover:border-zinc-300 hover:bg-zinc-50/60">
      <img
        src={`https://img.logo.dev/${job.company_url}?token=${logoDevPublicKey}`}
        className="size-10 shrink-0 overflow-hidden rounded-md border border-zinc-200 bg-zinc-50 object-contain"
        alt=""
        loading="lazy"
      />
      <div className="min-w-0 flex-1 space-y-3">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0 space-y-1">
            <h3 className="font-medium leading-snug text-zinc-900">
              {job.title}
            </h3>
            <p className="truncate text-sm text-zinc-500" title={job.location}>
              <span className="font-medium text-zinc-700">{job.company}</span>
              {job.location ? ` · ${truncateText(job.location, 60)}` : null}
            </p>
          </div>
          <span className="shrink-0 font-mono text-xs text-zinc-400">
            #{index + 1}
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-2 text-xs">
          {category ? (
            <span
              className={`inline-flex items-center rounded-md border px-2 py-0.5 font-medium ${category.badgeClassName}`}
            >
              {category.label}
            </span>
          ) : null}
          <span className="inline-flex items-center rounded-md border border-zinc-200 px-2 py-0.5 font-medium text-zinc-600">
            {formattedDate}
          </span>
          <span className="font-mono text-zinc-400">ID {job.id}</span>
          {job.url !== "" ? (
            <a
              className="ml-auto inline-flex h-7 items-center gap-1 rounded-md border border-zinc-200 bg-white px-2.5 text-xs font-medium text-zinc-900 shadow-xs transition-colors hover:bg-zinc-100"
              href={job.url}
              target="_blank"
              rel="noreferrer"
              title={job.url}
            >
              View
              <span aria-hidden="true">↗</span>
            </a>
          ) : (
            <span className="ml-auto text-zinc-400">No link</span>
          )}
        </div>
      </div>
    </article>
  );
}
