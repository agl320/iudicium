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

  return (
    <section className="flex min-h-screen">
      <div className="w-1/6"></div>
      <div className="w-4/6 border-l border-r border-zinc-300 items-center text-center space-y-8 py-16 text-zinc-800 px-16">
        <h1 className="text-7xl font-rubber-biscuit italic text-zinc-800">
          iudicium
        </h1>
        <form className="" onSubmit={handleSearchSubmit}>
          <label className="" htmlFor="job-search">
            <input
              id="job-search"
              type="search"
              className="bg-gray-200 rounded px-4 py-2 mx-2"
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
              placeholder="e.g. engineer, manager, analyst"
            />
          </label>
          <button
            className="bg-zinc-800 text-white px-4 py-2 rounded hover:bg-zinc-700 cursor-pointer"
            type="submit"
            disabled={loading}
          >
            {loading ? "Loading..." : "Search (max 100)"}
          </button>
        </form>

        {error ? <p>{error}</p> : null}

        <div className="text-sm text-zinc-600">
          <p>Showing {jobs.length} jobs</p>
        </div>

        <div className="text-left">
          {jobs.map((job) => (
            <article key={job.id} className="">
              <div className="">
                <h3>{job.title}</h3>
                <span>{job.company}</span>
              </div>
              <p>{job.location}</p>
              <img
                src={`https://img.logo.dev/${job.company_url}?token=${LOGO_DEV_PUBLIC_KEY}`}
                alt={`${job.company} logo`}
              />
              <p>
                <a href={job.url} target="_blank" rel="noreferrer">
                  View posting
                </a>
              </p>
            </article>
          ))}

          {!loading && jobs.length === 0 ? (
            <p className="">No jobs found for that search.</p>
          ) : null}
        </div>
      </div>
      <div className="w-1/6"></div>
    </section>
  );
}

export default App;
