import type { FormEvent } from "react";

type SearchFormProps = {
  searchTerm: string;
  loading: boolean;
  onSearchTermChange: (value: string) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void | Promise<void>;
};

export function SearchForm({
  searchTerm,
  loading,
  onSearchTermChange,
  onSubmit,
}: SearchFormProps) {
  return (
    <form className="flex w-full max-w-md items-center gap-2" onSubmit={onSubmit}>
      <label className="sr-only" htmlFor="job-search">
        Search job titles
      </label>
      <div className="relative flex-1">
        <svg
          aria-hidden="true"
          viewBox="0 0 24 24"
          className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-zinc-400"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <circle cx="11" cy="11" r="8" />
          <path d="m21 21-4.3-4.3" />
        </svg>
        <input
          id="job-search"
          type="search"
          className="h-9 w-full rounded-md border border-zinc-200 bg-white pl-9 pr-3 text-sm text-zinc-900 shadow-xs outline-none transition-[color,box-shadow] placeholder:text-zinc-400 focus-visible:border-zinc-400 focus-visible:ring-[3px] focus-visible:ring-zinc-400/20"
          value={searchTerm}
          onChange={(event) => onSearchTermChange(event.target.value)}
          placeholder="e.g. Software Engineer"
        />
      </div>
      <button
        className="inline-flex h-9 cursor-pointer items-center justify-center rounded-md bg-zinc-900 px-4 text-sm font-medium text-zinc-50 shadow-xs transition-colors hover:bg-zinc-900/90 focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-zinc-400/40 disabled:pointer-events-none disabled:opacity-50"
        type="submit"
        disabled={loading}
      >
        {loading ? "Searching…" : "Search"}
      </button>
    </form>
  );
}
