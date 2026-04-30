import type { JobPosting } from "../types/jobs";
import { formatDate, truncateText } from "../utils/jobs";

type JobCardProps = {
  job: JobPosting;
  logoDevPublicKey: string;
};

export function JobCard({ job, logoDevPublicKey }: JobCardProps) {
  const formattedDate = formatDate(job.first_seen);

  return (
    <article
      key={job.id}
      className="flex gap-x-4 border-t border-b border-dashed border-zinc-300  p-4 "
    >
      <img
        src={`https://img.logo.dev/${job.company_url}?token=${logoDevPublicKey}`}
        className=" w-12 h-12"
        alt={`${job.company} logo`}
      />
      <div className="w-full space-y-8">
        <h3 className="font-medium text-xl max-w-120">{job.title}</h3>
        <div className="grid grid-cols-[1fr_1fr_2fr_1fr_1fr] gap-4 uppercase">
          <div className="min-w-0 w-full">
            <p>COMPANY</p>
            <p className="font-medium truncate" title={job.company}>
              {truncateText(job.company, 24)}
            </p>
          </div>
          <div className="min-w-0 w-full">
            <p>DATE</p>
            <p className="font-medium truncate" title={formattedDate}>
              {truncateText(formattedDate, 24)}
            </p>
          </div>
          <div className="min-w-0 w-full">
            <p>LOCATION</p>
            <p className="font-medium truncate" title={job.location}>
              {truncateText(job.location, 24)}
            </p>
          </div>
          <div className="min-w-0 w-full">
            <p>ID</p> <p className="font-medium">{job.id}</p>
          </div>
          <div className="min-w-0 w-full">
            <p>LINK</p>
            {job.url !== "" ? (
              <a
                className="font-medium truncate block"
                href={job.url}
                target="_blank"
                rel="noreferrer"
                title={job.url}
              >
                {truncateText("View", 24)}
              </a>
            ) : (
              <p className="font-medium text-zinc-400">View</p>
            )}
          </div>
        </div>
      </div>
    </article>
  );
}
