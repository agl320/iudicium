import { lazy, Suspense, useEffect, useState } from "react";
import "./App.css";
import { fetchBackendStatus } from "./api/jobs";
import { CategoryFilter } from "./components/CategoryFilter";
import { JobList } from "./components/JobList";
import { SearchForm } from "./components/SearchForm";
import { SiteFooter, SiteHeader } from "./components/SiteHeader";
import { useHashRoute } from "./hooks/useHashRoute";
import { type JobsRequest, useJobFeed } from "./hooks/useJobFeed";

// Loaded on demand so the job board does not download the editor/account UI.
const ResumeBuilder = lazy(() => import("./resume/ResumeBuilder"));
const AuthPage = lazy(() => import("./account/AuthPage"));
const AccountPage = lazy(() => import("./account/AccountPage"));

const LOGO_DEV_PUBLIC_KEY = import.meta.env.VITE_LOGO_DEV_PUBLIC_KEY;

function formatUpdated(value: string): string {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(parsed);
}

function JobBoard() {
  const [searchTerm, setSearchTerm] = useState<string>("");
  // A new object on every search/filter so re-running the same search refetches.
  const [request, setRequest] = useState<JobsRequest>({ query: "", category: null });
  const feed = useJobFeed(request);
  const [updatedAt, setUpdatedAt] = useState<string>("");

  useEffect(() => {
    fetchBackendStatus()
      .then((status) => setUpdatedAt(status.last_updated_at ?? ""))
      .catch(() => setUpdatedAt(""));
  }, []);

  function updateRequest(next: Partial<JobsRequest>) {
    setRequest((current) => ({ ...current, ...next }));
  }

  function handleSearchSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    updateRequest({ query: searchTerm });
  }

  const count = feed.loading
    ? "Loading…"
    : feed.total !== null
      ? `${feed.jobs.length.toLocaleString()} of ${feed.total.toLocaleString()} postings`
      : `${feed.jobs.length} postings`;

  return (
    <div className="flex min-h-screen flex-col">
      <SiteHeader wordmark signIn />

      <main className="mx-auto w-full max-w-6xl flex-1 px-4">
        <div className="sticky top-[var(--header-h)] z-20 -mx-4 flex flex-col gap-3 border-b border-line bg-paper/80 px-4 py-3 backdrop-blur-md lg:flex-row lg:items-center">
          <SearchForm
            searchTerm={searchTerm}
            loading={feed.loading}
            onSearchTermChange={setSearchTerm}
            onSubmit={handleSearchSubmit}
          />
          <CategoryFilter value={request.category} onChange={(category) => updateRequest({ category })} />
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 py-2.5">
          <span className="text-sm font-medium">{count}</span>
          <span className="text-xs text-neutral-500">
            {updatedAt ? `Updated ${formatUpdated(updatedAt)}` : "Updated every 30 min"} · newest first
          </span>
        </div>

        {feed.error ? (
          <p className="mb-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{feed.error}</p>
        ) : null}

        <JobList
          jobs={feed.jobs}
          logoDevPublicKey={LOGO_DEV_PUBLIC_KEY}
          loading={feed.loading}
          loadingMore={feed.loadingMore}
          hasMore={feed.hasMore}
          onLoadMore={feed.loadMore}
        />
      </main>

      <SiteFooter />
    </div>
  );
}

const PAGES: Record<string, React.LazyExoticComponent<() => React.JSX.Element>> = {
  "/resume": ResumeBuilder,
  "/login": AuthPage,
  "/account": AccountPage,
};

function App() {
  const route = useHashRoute().split("?")[0];
  const Page = PAGES[route];
  return (
    <>
      {Page ? (
        <Suspense
          fallback={
            <div className="flex h-screen items-center justify-center text-sm text-neutral-500">
              Loading…
            </div>
          }
        >
          <Page />
        </Suspense>
      ) : (
        <JobBoard />
      )}
    </>
  );
}

export default App;
