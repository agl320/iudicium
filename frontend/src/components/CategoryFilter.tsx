import { CATEGORIES } from "../utils/categories";

type CategoryFilterProps = {
  value: string | null;
  onChange: (value: string | null) => void;
};

const OPTIONS = [
  { key: null, label: "All", dotClassName: "bg-zinc-400" },
  ...CATEGORIES,
];

export function CategoryFilter({ value, onChange }: CategoryFilterProps) {
  return (
    <div
      role="tablist"
      aria-label="Job type"
      className="inline-flex h-9 items-center self-start rounded-lg bg-zinc-100 p-[3px] text-sm lg:self-auto"
    >
      {OPTIONS.map((option) => {
        const active = option.key === value;
        return (
          <button
            key={option.key ?? "all"}
            role="tab"
            type="button"
            aria-selected={active}
            onClick={() => onChange(option.key)}
            className={`inline-flex h-full cursor-pointer items-center gap-2 rounded-md px-3 font-medium transition-[color,box-shadow] ${
              active
                ? "bg-white text-zinc-900 shadow-sm"
                : "text-zinc-500 hover:text-zinc-900"
            }`}
          >
            <span className={`size-2 rounded-full ${option.dotClassName}`} />
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
