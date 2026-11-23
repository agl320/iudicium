// Autofill profiles: a resume (experience, education, skills, contact) plus
// the facts a resume doesn't hold (address, work authorization, EEO...).
// Same JSON shape as the extension's Profile (extension/src/core/profile.ts).

import type { Resume } from "../resume/types";

export type Month = string; // "YYYY-MM" or "YYYY"
export type Level = "highschool" | "diploma" | "associate" | "bachelor" | "master" | "doctorate";

export type AutofillProfile = {
  id: string;
  label: string;
  origin?: { resumeId?: string; resumeTitle?: string; syncedAt: string };
  resumeFile?: { name: string; type: string; data: string; updated?: string };
  person: {
    firstName: string;
    middleName?: string;
    lastName: string;
    preferredFirstName?: string;
    email: string;
    phone: string;
    phoneType: string;
    phoneCountry: string;
    address: { line1: string; line2?: string; city: string; region: string; postalCode: string; country: string };
  };
  links: { linkedin?: string; github?: string; website?: string };
  work: {
    authorized: Record<string, boolean>;
    sponsorship: Record<string, boolean>;
    homeCountry: string;
    willingToRelocate: boolean;
    noticePeriod?: string;
    earliestStart?: string;
    salaryExpectation?: string;
  };
  screening: { over18: boolean; relativesAtEmployers: string[]; sources: string[] };
  eeo: {
    gender: "male" | "female" | "nonbinary" | "decline";
    hispanicLatino: "yes" | "no" | "decline";
    race: string;
    veteran: "not" | "protected" | "decline";
    disability: "yes" | "no" | "decline";
  };
  skills: string[];
  experience: { company: string; title: string; location?: string; start: Month; end?: Month; description?: string }[];
  education: { school: string; degree: string; level: Level; field?: string; gpa?: string; start?: Month; end?: Month }[];
};

/** What the dashboard asks for once per resume (a resume can't answer these). */
export type ApplicantFacts = {
  label: string;
  preferredFirstName: string;
  phoneCountry: string;
  address: AutofillProfile["person"]["address"];
  homeCountry: string;
  authorized: string[]; // countries you may work in
  sponsorship: string[]; // countries where you'd need a visa
  willingToRelocate: boolean;
  noticePeriod: string;
  earliestStart: string;
  salaryExpectation: string;
  sources: string;
  eeo: AutofillProfile["eeo"];
};

export function defaultFacts(label: string): ApplicantFacts {
  return {
    label,
    preferredFirstName: "",
    phoneCountry: "Canada",
    address: { line1: "", city: "", region: "", postalCode: "", country: "Canada" },
    homeCountry: "Canada",
    authorized: ["Canada"],
    sponsorship: ["United States"],
    willingToRelocate: true,
    noticePeriod: "2 weeks",
    earliestStart: "",
    salaryExpectation: "",
    sources: "Company Website, LinkedIn, Job Board, Other",
    eeo: { gender: "decline", hispanicLatino: "decline", race: "decline", veteran: "decline", disability: "decline" },
  };
}

// --- Reading a resume --------------------------------------------------------------

const plain = (s: string) => s.replace(/\*\*/g, "").replace(/\s+/g, " ").trim();

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
const SEASONS: Record<string, string> = { spring: "05", summer: "06", fall: "09", autumn: "09", winter: "01" };

/** "May 2024" → "2024-05", "2019" → "2019", "Summer 2025" → "2025-06". */
export function parseMonth(s: string): Month | undefined {
  const t = s.trim().toLowerCase();
  if (!t || /present|current|now|ongoing|today/.test(t)) return undefined;
  const year = t.match(/\b(19|20)\d{2}\b/)?.[0];
  if (!year) return undefined;
  const m = MONTHS.findIndex((name) => t.includes(name));
  if (m >= 0) return `${year}-${String(m + 1).padStart(2, "0")}`;
  const numeric = t.match(/\b(\d{1,2})\s*[/.-]\s*(19|20)\d{2}\b/)?.[1];
  if (numeric && +numeric >= 1 && +numeric <= 12) return `${year}-${numeric.padStart(2, "0")}`;
  const season = Object.keys(SEASONS).find((k) => t.includes(k));
  if (season) return `${year}-${SEASONS[season]}`;
  return year;
}

/** "May 2024 – Present" → { start: "2024-05" } (no end = current). */
export function parseRange(date: string): { start?: Month; end?: Month; current: boolean } {
  const parts = date.split(/\s+(?:–|—|-|to)\s+|\s*[–—]\s*/i).filter(Boolean);
  const start = parseMonth(parts[0] ?? "");
  const endText = parts.length > 1 ? parts[parts.length - 1] : "";
  const current = /present|current|now|ongoing/i.test(endText);
  const end = parts.length > 1 ? parseMonth(endText) : start;
  return { start, end: current ? undefined : end, current };
}

export function levelOf(degree: string): Level {
  const d = degree.toLowerCase().replace(/\./g, "");
  if (/\b(phd|doctor|dphil|edd|md)\b/.test(d)) return "doctorate";
  if (/\b(master|msc|ms|ma|mba|meng|masc|mfa|mpp|mph)\b/.test(d)) return "master";
  if (/\b(associate|aa|as|aas)\b/.test(d)) return "associate";
  if (/\b(diploma|certificate|cert)\b/.test(d)) return "diploma";
  if (/\b(high school|secondary|ged)\b/.test(d)) return "highschool";
  return "bachelor";
}

function splitName(name: string) {
  const parts = plain(name).split(" ").filter(Boolean);
  if (parts.length <= 1) return { firstName: parts[0] ?? "", lastName: "" };
  return { firstName: parts[0], middleName: parts.slice(1, -1).join(" ") || undefined, lastName: parts[parts.length - 1] };
}

const url = (s: string) => (/^https?:\/\//i.test(s) ? s : `https://${s}`);

function contactOf(resume: Resume) {
  const out: { email?: string; phone?: string; linkedin?: string; github?: string; website?: string; city?: string; region?: string } = {};
  for (const raw of resume.contact) {
    const c = plain(raw);
    if (/@/.test(c) && /\.\w{2,}/.test(c) && !/\s/.test(c)) out.email = c;
    else if (/linkedin\.com/i.test(c)) out.linkedin = url(c);
    else if (/github\.com/i.test(c)) out.github = url(c);
    else if ((c.match(/\d/g) ?? []).length >= 10 && /^[\d\s()+.-]+$/.test(c)) out.phone = c.replace(/^\+?1[\s.-]*/, "").replace(/[()]/g, "").replace(/[.-]/g, " ").replace(/\s+/g, " ").trim();
    else if (/^[\w-]+(\.[\w-]+)+(\/\S*)?$/.test(c)) out.website = url(c);
    else if (/^[A-Za-z .'-]+,\s*[A-Za-z .'-]+$/.test(c)) [out.city, out.region] = c.split(/,\s*/);
  }
  return out;
}

const PROVINCES: Record<string, string> = { BC: "British Columbia", AB: "Alberta", ON: "Ontario", QC: "Quebec", MB: "Manitoba", SK: "Saskatchewan", NS: "Nova Scotia", NB: "New Brunswick", NL: "Newfoundland and Labrador", PE: "Prince Edward Island" };

function sectionsLike(resume: Resume, re: RegExp) {
  return resume.sections.filter((s) => re.test(s.title));
}

/** Everything the resume itself can tell an application form. */
export function fromResume(resume: Resume) {
  const contact = contactOf(resume);
  const experience = sectionsLike(resume, /experience|employment|work history|professional/i).flatMap((s) =>
    s.entries
      .filter((e) => !e.plain && (e.title || e.subtitle))
      .map((e) => {
        const r = parseRange(e.date);
        return {
          company: plain(e.title),
          title: plain(e.subtitle),
          location: plain(e.location) || undefined,
          start: r.start ?? "",
          end: r.current ? undefined : r.end,
          description: e.points.filter((p) => p.active).map((p) => `• ${plain(p.text)}`).join("\n") || undefined,
        };
      }),
  );
  const education = sectionsLike(resume, /education|academic/i).flatMap((s) =>
    s.entries
      .filter((e) => !e.plain && e.title)
      .map((e) => {
        const r = parseRange(e.date);
        const sub = plain(e.subtitle);
        // "B.B.A., Human Resource Management" / "Bachelor of Science in Computer Science"
        const [degree, field] = sub.includes(",") ? sub.split(/,\s*(.+)/) : sub.split(/\s+in\s+(.+)/i);
        const gpa = e.points.map((p) => plain(p.text).match(/\bGPA:?\s*([\d.]+(?:\s*\/\s*[\d.]+)?)/i)?.[1]).find(Boolean);
        return { school: plain(e.title), degree: degree?.trim() || sub, level: levelOf(sub), field: field?.trim() || undefined, gpa, start: r.start, end: r.end };
      }),
  );
  const skills = [
    ...new Set(
      sectionsLike(resume, /skill|technolog|tools/i)
        .flatMap((s) => s.entries.flatMap((e) => e.points.filter((p) => p.active).map((p) => plain(p.text))))
        .flatMap((line) => line.replace(/^[^:]{1,40}:\s*/, "").split(/\s*[,;•|]\s*/))
        .map((s) => s.replace(/\(.*?\)/g, "").trim())
        .filter((s) => s && s.length < 40),
    ),
  ];
  return { name: splitName(resume.name), contact, experience, education, skills };
}

/** Resume + facts → the profile the extension fills forms from. */
export function buildProfile(resume: Resume, facts: ApplicantFacts, opts: { id: string; resumeId?: string; resumeTitle?: string }): AutofillProfile {
  const r = fromResume(resume);
  const region = facts.address.region || PROVINCES[(r.contact.region ?? "").toUpperCase()] || r.contact.region || "";
  const flag = (list: string[]) => Object.fromEntries(list.filter(Boolean).map((c) => [c, true]));
  const all = [...new Set([...facts.authorized, ...facts.sponsorship, facts.homeCountry, "Canada", "United States"])];
  return {
    id: opts.id,
    label: facts.label,
    origin: { resumeId: opts.resumeId, resumeTitle: opts.resumeTitle, syncedAt: new Date().toISOString() },
    person: {
      ...r.name,
      preferredFirstName: facts.preferredFirstName || undefined,
      email: r.contact.email ?? "",
      phone: r.contact.phone ?? "",
      phoneType: "Mobile",
      phoneCountry: facts.phoneCountry,
      address: { ...facts.address, city: facts.address.city || r.contact.city || "", region },
    },
    links: { linkedin: r.contact.linkedin, github: r.contact.github, website: r.contact.website },
    work: {
      authorized: { ...Object.fromEntries(all.map((c) => [c, false])), ...flag(facts.authorized) },
      sponsorship: { ...Object.fromEntries(all.map((c) => [c, false])), ...flag(facts.sponsorship) },
      homeCountry: facts.homeCountry,
      willingToRelocate: facts.willingToRelocate,
      noticePeriod: facts.noticePeriod || undefined,
      earliestStart: facts.earliestStart || undefined,
      salaryExpectation: facts.salaryExpectation || undefined,
    },
    screening: { over18: true, relativesAtEmployers: [], sources: facts.sources.split(/\s*,\s*/).filter(Boolean) },
    eeo: facts.eeo,
    skills: r.skills,
    experience: r.experience,
    education: r.education,
  };
}

/** Blob → base64 (for the resume file the extension attaches). */
export async function toBase64(blob: Blob): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}
