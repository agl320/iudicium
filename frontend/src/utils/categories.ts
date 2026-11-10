// Mirrors the tracks in backend/config/companies.toml (key, label, colour).
export type CategoryKey = "tech_intern" | "hr";

export type Category = {
  key: CategoryKey;
  label: string;
  // Tailwind classes for the badge / dot so colours stay in sync with Discord.
  badgeClassName: string;
  dotClassName: string;
  // Solid fill for the selected job-type filter.
  fill: string;
};

export const CATEGORIES: Category[] = [
  {
    key: "tech_intern",
    label: "Tech intern",
    badgeClassName: "border-sky-200 bg-sky-50 text-sky-800",
    dotClassName: "bg-[#0BBEFE]",
    fill: "linear-gradient(120deg, #0ea5e9 0%, #0284c7 100%)",
  },
  {
    key: "hr",
    label: "HR / Payroll",
    badgeClassName: "border-pink-200 bg-pink-50 text-pink-800",
    dotClassName: "bg-[#EC4899]",
    fill: "linear-gradient(120deg, #ec4899 0%, #db2777 100%)",
  },
];

export function getCategory(key: string | null | undefined): Category | undefined {
  return CATEGORIES.find((category) => category.key === key);
}
