import { useState } from "react";
import type { AtsIssue } from "./ats";
import type { Selection } from "./Preview";
import { PanelSection } from "./ui";

const DOT = { error: "bg-red-500", warning: "bg-amber-400", tip: "bg-neutral-300" };

/** ATS readiness summary; clicking an issue selects the part to fix. */
export function AtsPanel({ issues, onSelect }: { issues: AtsIssue[]; onSelect: (target: Selection | undefined) => void }) {
  const [open, setOpen] = useState(true);
  const serious = issues.filter((i) => i.level !== "tip").length;
  const summary =
    issues.length === 0 ? "Ready to parse" : serious === 0 ? `${issues.length} suggestion${issues.length > 1 ? "s" : ""}` : `${serious} to fix`;

  return (
    <PanelSection
      title="ATS check"
      action={
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          className={`tag cursor-pointer transition-colors ${
            issues.length === 0 ? "bg-emerald-50 text-emerald-700" : serious ? "bg-amber-50 text-amber-800" : ""
          }`}
        >
          {summary}
          {issues.length ? <span className={`transition-transform ${open ? "rotate-180" : ""}`}>▾</span> : null}
        </button>
      }
    >
      {issues.length === 0 ? (
        <p className="text-xs leading-relaxed text-neutral-700">
          Standard headings, contact details and dates found. Exports keep real text, so Workday and other ATS can read them.
        </p>
      ) : open ? (
        <ul className="space-y-1">
          {issues.map((issue, index) => (
            <li key={index}>
              <button
                type="button"
                onClick={() => onSelect(issue.target)}
                disabled={!issue.target}
                className="flex w-full cursor-pointer items-start gap-2 rounded-lg px-2 py-1.5 text-left text-xs leading-snug text-ink transition-colors hover:bg-wash disabled:cursor-default disabled:hover:bg-transparent"
              >
                <span className={`mt-1 size-2 shrink-0 rounded-full ${DOT[issue.level]}`} />
                {issue.message}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </PanelSection>
  );
}
