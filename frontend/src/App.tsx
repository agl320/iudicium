import { useState } from "react";
import "./App.css";

const BACKEND_API_URL = import.meta.env.VITE_BACKEND_API_URL;
const LOGO_DEV_PUBLIC_KEY = import.meta.env.VITE_LOGO_DEV_PUBLIC_KEY;

type JobPosting = {
  id: number;
  company: string;
  company_url: string;
  title: string;
  url: string;
  source: string;
  location: string;
  first_seen: string;
  last_seen: string;
};

function App() {
  const [jobs, setJobs] = useState<JobPosting[]>([]);
  const [searchTerm, setSearchTerm] = useState<string>("");
  const [error, setError] = useState<string>("");
  const [loading, setLoading] = useState<boolean>(false);

  async function fetchData(query: string) {
    setLoading(true);
    setError("");

    try {
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

      const data = (await response.json()) as JobPosting[];
      setJobs(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
      setJobs([]);
    } finally {
      setLoading(false);
    }
  }

  async function handleSearchSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await fetchData(searchTerm);
  }

  function formatDate(dateString: string): string {
    const date = new Date(dateString);
    return date.toLocaleDateString();
  }

  function truncateText(value: string, maxLength: number): string {
    if (value.length <= maxLength) {
      return value;
    }

    return `${value.slice(0, maxLength - 1)}…`;
  }

  return (
    <section className="flex min-h-screen">
      <div className="w-1/5"></div>
      <div className="w-3/5 border-l border-r border-zinc-300 items-center text-center space-y-8 py-16 text-zinc-800 px-16">
        <h1 className="text-7xl font-medium text-zinc-800">Iudicium</h1>
        <form className="" onSubmit={handleSearchSubmit}>
          <label className="" htmlFor="job-search">
            <input
              id="job-search"
              type="search"
              className="bg-gray-200 px-4 py-2 mx-2 "
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
              placeholder="e.g. engineer, manager, analyst"
            />
          </label>
          <button
            className="bg-zinc-800 text-white px-4 py-2  hover:bg-zinc-700 cursor-pointer"
            type="submit"
            disabled={loading}
          >
            {loading ? "Loading..." : "Search"}
          </button>
        </form>

        {error ? <p>{error}</p> : null}

        <div className="text-sm text-zinc-600">
          <p>Showing {jobs.length} jobs</p>
        </div>

        <div className="text-left space-y-8">
          {jobs.map((job) => (
            <article
              key={job.id}
              className="flex gap-x-4 border border-dashed border-zinc-300  p-4 "
            >
              <img
                src={`https://img.logo.dev/${job.company_url}?token=${LOGO_DEV_PUBLIC_KEY}`}
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
                    <p
                      className="font-medium truncate"
                      title={formatDate(job.first_seen)}
                    >
                      {truncateText(formatDate(job.first_seen), 24)}
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
                    <a
                      className="font-medium truncate block"
                      href={job.url}
                      target="_blank"
                      rel="noreferrer"
                      title={job.url}
                    >
                      {truncateText("View posting", 24)}
                    </a>
                  </div>
                </div>
              </div>
            </article>
          ))}

          {!loading && jobs.length === 0 ? (
            <p className="">No jobs found for that search.</p>
          ) : null}
        </div>
      </div>
      <div className="w-1/5"></div>
    </section>
  );
}

export default App;
