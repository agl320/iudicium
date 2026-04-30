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
    <form className="" onSubmit={onSubmit}>
      <label className="" htmlFor="job-search">
        <input
          id="job-search"
          type="search"
          className="bg-gray-200 px-4 py-2 mx-2 "
          value={searchTerm}
          onChange={(event) => onSearchTermChange(event.target.value)}
          placeholder="e.g. engineer, manager, analyst"
        />
      </label>
      <button
        className="bg-zinc-800 text-white px-4 py-2 hover:bg-zinc-700 cursor-pointer"
        type="submit"
        disabled={loading}
      >
        {loading ? "Loading..." : "Search"}
      </button>
    </form>
  );
}
