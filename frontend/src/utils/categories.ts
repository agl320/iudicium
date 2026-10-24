// Mirrors the tracks in backend/config/companies.toml (key, label, colour).
export type CategoryKey = "tech_intern" | "hr";

export type Category = {
  key: CategoryKey;
  label: string;
  // Tailwind classes for the badge / dot so colours stay in sync with Discord.
  badgeClassName: string;
  dotClassName: string;
};

export const CATEGORIES: Category[] = [
  {
    key: "tech_intern",
    label: "Tech intern",
    badgeClassName: "border-sky-200 bg-sky-50 text-sky-700",
    dotClassName: "bg-[#0BBEFE]",
  },
  {
    key: "hr",
    label: "HR / Payroll",
    badgeClassName: "border-pink-200 bg-pink-50 text-pink-700",
    dotClassName: "bg-[#EC4899]",
  },
];

export function getCategory(key: string | null | undefined): Category | undefined {
  return CATEGORIES.find((category) => category.key === key);
}
