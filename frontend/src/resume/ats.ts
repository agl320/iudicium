// Applicant-tracking-system (Workday, Greenhouse, Lever, iCIMS, Taleo...)
// readiness: a plain-text rendering in reading order — what a parser
// extracts — and checks for things that commonly break parsing.

import type { Selection } from "./Preview";
import { parseRuns } from "./runs";
import type { Resume } from "./types";

/** Section names parsers map to their resume fields. */
const STANDARD_SECTIONS =
  /^(summary|professional summary|profile|objective|experience|work experience|professional experience|employment|employment history|work history|relevant experience|education|skills|technical skills|core competencies|projects|certifications?|licenses?( (and|&) certifications)?|certifications? (and|&) licenses?|awards|honou?rs( (and|&) awards)?|publications|volunteer( experience)?|volunteering|leadership|languages|training|professional development|courses|coursework|relevant coursework|activities|interests|additional information)$/i;

const EMAIL = /[^\s@|]+@[^\s@|]+\.[a-z]{2,}/i;
// 10-15 digits, typical separators; checked per contact item (not URLs).
const PHONE = /^\+?[\d\s().-]{10,22}$/;
const MONTH_YEAR = /\b(jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\.?\s+(19|20)\d{2}\b/i;
const NUMERIC_DATE = /\b\d{1,2}\/(19|20)?\d{2}\b/;
const YEAR = /\b(19|20)\d{2}\b/;
// Typographic characters ATS handle fine; anything else outside Latin-1 is flagged.
const SAFE_EXTRA = "–—•‘’“”…·";
const LONG_POINT = 260;

export type AtsIssue = {
  level: "error" | "warning" | "tip";
  message: string;
  target?: Selection;
};

const plain = (text: string) => parseRuns(text).map((run) => run.text).join("");

export function toPlainText(resume: Resume): string {
  const lines: string[] = [resume.name, resume.contact.filter(Boolean).join(" | "), ""];
  for (const section of resume.sections) {
    lines.push(section.title.toUpperCase());
    for (const entry of section.entries) {
      const points = entry.points.filter((p) => p.active);
      const title = [entry.title, entry.date].filter(Boolean).join(" — ");
      const subtitle = [entry.subtitle, entry.location].filter(Boolean).join(" — ");
      if ((title || subtitle) && lines.at(-1) !== "" && lines.at(-1) !== section.title.toUpperCase()) lines.push("");
      if (title) lines.push(title);
      if (subtitle) lines.push(subtitle);
      for (const point of points) {
        const text = plain(point.text).replace(/\s+/g, " ").trim();
        if (text) lines.push(`${entry.plain ? "" : "• "}${text}`);
      }
      if (title || subtitle) lines.push("");
    }
    if (lines.at(-1) !== "") lines.push("");
  }
  return lines.join("\n").replace(/\n{3,}/g, "\n\n").trim() + "\n";
}

function oddCharacters(text: string): string[] {
  const found = new Set<string>();
  for (const char of text) {
    const code = char.codePointAt(0) ?? 0;
    if (code > 0xff && !SAFE_EXTRA.includes(char)) found.add(char);
  }
  return [...found];
}

function dateStyle(date: string): string | null {
  if (MONTH_YEAR.test(date)) return "Month YYYY";
  if (NUMERIC_DATE.test(date)) return "MM/YYYY";
  if (YEAR.test(date)) return "YYYY";
  return null;
}

export function checkAts(resume: Resume): AtsIssue[] {
  const issues: AtsIssue[] = [];
  const header: Selection = { kind: "header" };
  const contact = resume.contact.join(" ");

  if (!resume.name.trim()) issues.push({ level: "error", message: "Add your name — parsers take it from the first line.", target: header });
  if (!EMAIL.test(contact)) issues.push({ level: "error", message: "Add an email address to the contact line.", target: header });
  const hasPhone = resume.contact.some((item) => {
    const digits = item.replace(/\D/g, "").length;
    return PHONE.test(item.trim()) && digits >= 10 && digits <= 15;
  });
  if (!hasPhone) issues.push({ level: "warning", message: "Add a phone number to the contact line.", target: header });

  const titles = resume.sections.map((s) => s.title.trim().toLowerCase());
  if (!titles.some((t) => /experience|employment|work history/.test(t))) {
    issues.push({ level: "warning", message: "No “Experience” section — parsers look for one by name." });
  }
  if (!titles.some((t) => /education/.test(t))) {
    issues.push({ level: "tip", message: "No “Education” section." });
  }

  for (const section of resume.sections) {
    const target: Selection = { kind: "section", sectionId: section.id };
    // Compared per section: years-only education next to "May 2024" jobs is normal.
    const styles = new Set<string>();
    if (!STANDARD_SECTIONS.test(section.title.trim())) {
      issues.push({
        level: "warning",
        message: `“${section.title}” isn't a standard heading; ATS may not map it. Try Experience, Education, Skills, Projects…`,
        target,
      });
    }
    for (const entry of section.entries) {
      const entryTarget: Selection = { kind: "entry", sectionId: section.id, entryId: entry.id };
      const active = entry.points.filter((p) => p.active);
      const name = entry.title || section.title;
      if (!entry.plain && entry.title) {
        if (!entry.date.trim()) {
          issues.push({ level: "warning", message: `${name}: add dates so the parser can place it on a timeline.`, target: entryTarget });
        } else {
          const style = dateStyle(entry.date);
          if (style) styles.add(style);
          else issues.push({ level: "warning", message: `${name}: “${entry.date}” has no recognizable year.`, target: entryTarget });
        }
        if (!entry.subtitle.trim() && /experience|employment|work/i.test(section.title)) {
          issues.push({ level: "tip", message: `${name}: add a job title on the second line.`, target: entryTarget });
        }
        if (active.length === 0) {
          issues.push({ level: "tip", message: `${name}: no points on the page (all in the pool).`, target: entryTarget });
        }
      }
      for (const point of active) {
        const text = plain(point.text);
        const pointTarget: Selection = { kind: "point", sectionId: section.id, entryId: entry.id, pointId: point.id };
        if (text.length > LONG_POINT) {
          issues.push({ level: "tip", message: `${name}: a point is ${text.length} characters; keep points to 1–2 lines.`, target: pointTarget });
        }
        const odd = oddCharacters(text);
        if (odd.length) {
          issues.push({
            level: "warning",
            message: `${name}: “${odd.join(" ")}” may be dropped or garbled by parsers; use plain words (e.g. “to” for →).`,
            target: pointTarget,
          });
        }
      }
      const odd = oddCharacters(`${entry.title} ${entry.subtitle} ${entry.date} ${entry.location}`);
      if (odd.length) {
        issues.push({ level: "warning", message: `${name}: “${odd.join(" ")}” may not parse.`, target: entryTarget });
      }
    }
    if (styles.size > 1) {
      issues.push({
        level: "tip",
        message: `${section.title}: dates mix formats (${[...styles].join(", ")}); one format parses most reliably.`,
        target,
      });
    }
  }
  const contactOdd = oddCharacters(contact);
  if (contactOdd.length) {
    issues.push({ level: "warning", message: `Contact line has “${contactOdd.join(" ")}” (icons/symbols); use plain text.`, target: header });
  }
  return issues;
}
