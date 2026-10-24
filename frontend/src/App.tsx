import { useEffect, useState } from "react";
import "./App.css";
import { fetchBackendStatus, fetchRecentJobs } from "./api/jobs";
import { CategoryFilter } from "./components/CategoryFilter";
import { JobList } from "./components/JobList";
import { SearchForm } from "./components/SearchForm";
import type { JobPosting } from "./types/jobs";

const LOGO_DEV_PUBLIC_KEY = import.meta.env.VITE_LOGO_DEV_PUBLIC_KEY;

const LINKS = [
  { label: "GitHub", href: "https://github.com/agl320" },
  { label: "LinkedIn", href: "https://www.linkedin.com/in/the-andrew-lai/" },
  { label: "Contact", href: "https://andrewlai.ca/" },
];

type JobsRequest = {
  query: string;
  category: string | null;
};

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
  // A new object on every search/filter so re-running the same search refetches.
  const [request, setRequest] = useState<JobsRequest>({
    query: "",
    category: null,
  });
  const [error, setError] = useState<string>("");
  const [loading, setLoading] = useState<boolean>(true);
  const [backendLastUpdatedAt, setBackendLastUpdatedAt] = useState<string>("");

  useEffect(() => {
    fetchBackendStatus()
      .then((status) => setBackendLastUpdatedAt(status.last_updated_at ?? ""))
      .catch(() => setBackendLastUpdatedAt(""));
  }, []);

  useEffect(() => {
    let cancelled = false;

    fetchRecentJobs(request.query, request.category)
      .then((data) => {
        if (!cancelled) {
          setJobs(data);
          setError("");
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Unknown error");
          setJobs([]);
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [request]);

  function updateRequest(next: Partial<JobsRequest>) {
    setLoading(true);
    setRequest((current) => ({ ...current, ...next }));
  }

  function handleSearchSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    updateRequest({ query: searchTerm });
  }

  return (
    <div className="min-h-screen bg-white text-zinc-900">
      <section className="mx-auto flex min-h-screen max-w-6xl border-x border-zinc-200">
        <div className="hidden w-8 shrink-0 border-r border-dashed border-zinc-200 sm:block" />

        <aside className="hidden w-48 shrink-0 border-r border-dashed border-zinc-200 md:block">
          <header className="flex h-12 items-center border-b border-zinc-200 px-4">
            <span className="font-mono text-xs uppercase tracking-widest text-zinc-400">
              Links
            </span>
          </header>
          <nav className="space-y-1 p-2 text-sm">
            {LINKS.map((link) => (
              <a
                key={link.label}
                href={link.href}
                target="_blank"
                rel="noopener noreferrer"
                className="block rounded-md px-2 py-1.5 text-zinc-500 transition-colors hover:bg-zinc-100 hover:text-zinc-900"
              >
                {link.label}
              </a>
            ))}
          </nav>
        </aside>

        <main className="min-w-0 flex-1">
          <header className="flex h-12 items-center justify-between border-b border-zinc-200 px-6">
            <span className="text-sm font-semibold tracking-tight">Iudicium</span>
            <span className="inline-flex items-center rounded-full border border-zinc-200 px-2.5 py-0.5 text-xs text-zinc-500">
              Updated{" "}
              {backendLastUpdatedAt
                ? formatBackendLastUpdatedAt(backendLastUpdatedAt)
                : "—"}
            </span>
          </header>

          <div className="space-y-6 border-b border-zinc-200 px-6 py-10">
            <div className="space-y-2">
              <p className="font-mono text-xs uppercase tracking-widest text-zinc-400">
                Job board
              </p>
              <h1 className="text-5xl font-semibold tracking-tight text-zinc-900">
                Iudicium
              </h1>
              <p className="max-w-xl text-sm text-zinc-500">
                New tech internships and full-time HR, HRIS and payroll roles,
                pulled from company career sites every 30 minutes.
              </p>
            </div>

            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <SearchForm
                searchTerm={searchTerm}
                loading={loading}
                onSearchTermChange={setSearchTerm}
                onSubmit={handleSearchSubmit}
              />
              <CategoryFilter
                value={request.category}
                onChange={(category) => updateRequest({ category })}
              />
            </div>

            {error ? (
              <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                {error}
              </p>
            ) : null}
          </div>

          <div className="space-y-4 px-6 py-6">
            <p className="font-mono text-xs uppercase tracking-widest text-zinc-400">
              {loading ? "Loading…" : `Showing ${jobs.length} jobs`}
            </p>
            <JobList
              jobs={jobs}
              logoDevPublicKey={LOGO_DEV_PUBLIC_KEY}
              loading={loading}
            />
          </div>
        </main>

        <div className="hidden w-8 shrink-0 border-l border-dashed border-zinc-200 sm:block" />
      </section>
    </div>
  );
}

export default App;
