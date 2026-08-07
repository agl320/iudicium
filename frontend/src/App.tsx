import { useEffect, useState } from "react";
import "./App.css";
import { fetchBackendStatus, fetchRecentJobs } from "./api/jobs";
import { JobList } from "./components/JobList";
import { SearchForm } from "./components/SearchForm";
import type { JobPosting } from "./types/jobs";
import Canvas from "./components/Canvas";

const LOGO_DEV_PUBLIC_KEY = import.meta.env.VITE_LOGO_DEV_PUBLIC_KEY;

function formatBackendLastUpdatedAt(value: string): string {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(parsed);
}

function App() {
  const [jobs, setJobs] = useState<JobPosting[]>([]);
  const [searchTerm, setSearchTerm] = useState<string>("");
  const [error, setError] = useState<string>("");
  const [loading, setLoading] = useState<boolean>(false);
  const [backendLastUpdatedAt, setBackendLastUpdatedAt] = useState<string>("");

  useEffect(() => {
    async function loadBackendStatus() {
      try {
        const status = await fetchBackendStatus();
        setBackendLastUpdatedAt(status.last_updated_at ?? "");
      } catch {
        setBackendLastUpdatedAt("");
      }
    }

    void loadBackendStatus();
  }, []);

  async function fetchData(query: string) {
    setLoading(true);
    setError("");

    try {
      const data = await fetchRecentJobs(query);
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
    <div>
      <section className="flex min-h-screen">
        <div className="w-1/5"></div>
        <div className="w-3/5 border-l border-r border-zinc-300  text-zinc-800 flex">
          <div className="w-8 h-full border-r border-dashed border-zinc-300"></div>
          <div className="w-1/5 border-r border-dashed border-zinc-300">
            <header className="h-12 w-full border-b border-zinc-300"></header>
            <div className="space-y-4 py-8 text-sm text-zinc-500">
              <p>
                <a
                  href="https://github.com/agl320"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  GitHub
                </a>
              </p>
              <p>
                <a
                  href="https://www.linkedin.com/in/the-andrew-lai/"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  LinkedIn
                </a>
              </p>
              <p>
                <a
                  href="https://andrewlai.ca/"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Contact
                </a>
              </p>
            </div>
          </div>
          <div className="w-4/5">
            <header className="h-12 w-full border-b border-zinc-300"></header>

            <div className="space-y-8 py-8">
              <Canvas></Canvas>
              <h1 className="text-6xl font-medium text-zinc-800">Iudicium</h1>
              <SearchForm
                searchTerm={searchTerm}
                loading={loading}
                onSearchTermChange={setSearchTerm}
                onSubmit={handleSearchSubmit}
              />
              {error ? <p>{error}</p> : null}

              <div className="text-sm text-zinc-500 space-y-4">
                <p>
                  Backend last updated:{" "}
                  {backendLastUpdatedAt
                    ? formatBackendLastUpdatedAt(backendLastUpdatedAt)
                    : "unknown"}
                </p>
                <p>Showing {jobs.length} jobs</p>
              </div>
            </div>

            <JobList jobs={jobs} logoDevPublicKey={LOGO_DEV_PUBLIC_KEY} />
          </div>
          <div className="w-8 h-full border-l border-dashed border-zinc-300"></div>
        </div>
        <div className="w-1/5"></div>
      </section>
    </div>
  );
}

export default App;
