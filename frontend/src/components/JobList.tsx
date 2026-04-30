import type { JobPosting } from "../types/jobs";
import { JobCard } from "./JobCard";

type JobListProps = {
  jobs: JobPosting[];
  logoDevPublicKey: string;
};

export function JobList({ jobs, logoDevPublicKey }: JobListProps) {
  return (
    <div className="text-left space-y-8">
      {jobs.map((job) => (
        <JobCard key={job.id} job={job} logoDevPublicKey={logoDevPublicKey} />
      ))}
    </div>
  );
}
