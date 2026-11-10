import type { FormEvent } from "react";
import { MorphLabel } from "./MorphLabel";
import { SEARCH_ICON } from "./morphIcons";

type SearchFormProps = {
  searchTerm: string;
  loading: boolean;
  onSearchTermChange: (value: string) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void | Promise<void>;
};


export function SearchForm({ searchTerm, loading, onSearchTermChange, onSubmit }: SearchFormProps) {
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
      {/* Hover/focus: the word morphs into a magnifier. */}
      <button
        type="submit"
        aria-label="Search"
        aria-busy={loading}
        className={`btn btn-primary morph-btn w-[6.25rem] ${loading ? "is-loading" : ""}`}
      >
        <MorphLabel text="Search" paths={SEARCH_ICON} />
      </button>
    </form>
  );
}
