import type { FormEvent } from "react";

type SearchFormProps = {
  searchTerm: string;
  loading: boolean;
  onSearchTermChange: (value: string) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void | Promise<void>;
};

const WORD = "Search";

export function SearchForm({ searchTerm, loading, onSearchTermChange, onSubmit }: SearchFormProps) {
  const center = (WORD.length - 1) / 2;
  return (
    <form onSubmit={onSubmit} className="flex min-w-0 flex-1 items-center gap-2">
      <label className="sr-only" htmlFor="job-search">
        Search job titles
      </label>
      <input
        id="job-search"
        type="search"
        className="field min-w-0 flex-1"
        value={searchTerm}
        onChange={(event) => onSearchTermChange(event.target.value)}
        placeholder="Search titles — e.g. payroll analyst"
      />
      {/* Hover/focus: the letters collapse to the centre and a magnifier draws in. */}
      <button
        type="submit"
        aria-label="Search"
        aria-busy={loading}
        className={`btn btn-primary search-btn w-[6.25rem] ${loading ? "is-loading" : ""}`}
      >
        <span className="sb-word" aria-hidden="true">
          {[...WORD].map((letter, index) => (
            <span
              key={index}
              className="sb-letter"
              style={
                {
                  "--dx": `${(center - index) * 0.55}em`,
                  "--delay": `${Math.abs(index - center) * 22}ms`,
                  "--order": `${index * 30}ms`,
                } as React.CSSProperties
              }
            >
              {letter}
            </span>
          ))}
        </span>
        <svg className="sb-icon" viewBox="0 0 24 24" aria-hidden="true">
          <circle className="sb-lens" cx="10.5" cy="10.5" r="6" pathLength="1" />
          <path className="sb-handle" d="M15 15l5 5" pathLength="1" />
        </svg>
      </button>
    </form>
  );
}
