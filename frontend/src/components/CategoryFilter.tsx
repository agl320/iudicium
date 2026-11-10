import { CATEGORIES } from "../utils/categories";
import { BRAND_FILL, SlidingTabs, type SlidingTabOption } from "./SlidingTabs";

type CategoryFilterProps = {
  value: string | null;
  onChange: (value: string | null) => void;
};

const OPTIONS: SlidingTabOption<string | null>[] = [
  { key: null, label: "All", fill: BRAND_FILL },
  ...CATEGORIES.map((category) => ({ key: category.key, label: category.label, fill: category.fill })),
];

/** Job type filter: a sliding block in each category's colour. */
export function CategoryFilter({ value, onChange }: CategoryFilterProps) {
  return <SlidingTabs label="Job type" options={OPTIONS} value={value} onChange={onChange} />;
}
