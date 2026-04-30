import { useState } from "react";
import "./App.css";
import { fetchRecentJobs } from "./api/jobs";
import { JobList } from "./components/JobList";
import { SearchForm } from "./components/SearchForm";
import type { JobPosting } from "./types/jobs";

const LOGO_DEV_PUBLIC_KEY = import.meta.env.VITE_LOGO_DEV_PUBLIC_KEY;

function App() {
  const [jobs, setJobs] = useState<JobPosting[]>([]);
  const [searchTerm, setSearchTerm] = useState<string>("");
  const [error, setError] = useState<string>("");
  const [loading, setLoading] = useState<boolean>(false);

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
        <div className="w-3/5 border-l border-r border-zinc-300 text-center text-zinc-800 flex">
          <div className="w-8 h-full border-r border-dashed border-zinc-300"></div>
          <div className="w-full space-y-8">
            <header className="h-12 w-full border-b border-zinc-300"></header>
            <h1 className="text-7xl font-medium text-zinc-800">Iudicium</h1>
            <SearchForm
              searchTerm={searchTerm}
              loading={loading}
              onSearchTermChange={setSearchTerm}
              onSubmit={handleSearchSubmit}
            />

            {error ? <p>{error}</p> : null}

            <div className="text-sm text-zinc-600">
              <p>Showing {jobs.length} jobs</p>
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
