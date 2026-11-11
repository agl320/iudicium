// Common screening questions answered by reasoning over profile facts:
// work authorization, sponsorship, age, previous employment, graduation
// timing, education, skills. Anything it can't decide is left for later
// resolvers (an AI one, eventually) or for you.

import type { Answer, Context, Question, Resolver } from "../types";
import { companyVariants, employerIn, isYesNoOptions, mentionsWord, norm } from "../match";
import { LEVEL_NAMES, type Education } from "../profile";

type Rule = (q: Question, t: string, ctx: Context) => Answer | null;

const yes = (value: boolean, evidence: string, confidence: Answer["confidence"] = "high"): Answer => ({
  value,
  confidence,
  source: "screening",
  evidence,
});

const isBool = (q: Question) => q.kind === "yesno" || (q.kind === "choice" && isYesNoOptions(q.options)) || q.kind === "text";

// --- Countries ----------------------------------------------------------------

const COUNTRY_ALIASES: Record<string, RegExp> = {
  "United States": /\b(united states|u\.s\.a?\.?|usa|us|america)\b/i,
  Canada: /\bcanad(a|ian)\b/i,
  "United Kingdom": /\b(united kingdom|uk|u\.k\.|britain)\b/i,
};

function countryIn(text: string, ctx: Context): { country: string; stated: boolean } {
  for (const country of Object.keys(ctx.profile.work.authorized)) {
    const re = COUNTRY_ALIASES[country] ?? new RegExp(`\\b${country}\\b`, "i");
    if (re.test(text)) return { country, stated: true };
  }
  for (const [country, re] of Object.entries(COUNTRY_ALIASES)) if (re.test(text)) return { country, stated: true };
  return { country: ctx.profile.work.homeCountry, stated: false };
}

// --- Dates ----------------------------------------------------------------------

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
const SEASONS: Record<string, number> = { spring: 5, summer: 8, fall: 12, autumn: 12, winter: 12 };

type Ym = { at: number; value: number; label: string }; // value = year*12 + month-1

function monthsIn(text: string): Ym[] {
  const out: Ym[] = [];
  const re =
    /\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?,?\s+(\d{4})|\b(spring|summer|fall|autumn|winter)\s+(\d{4})|\b(\d{1,2})\/(\d{4})\b|\b(20\d{2})\b/gi;
  for (const m of text.matchAll(re)) {
    let y: number;
    let mo: number;
    if (m[1]) [y, mo] = [+m[2], MONTHS.indexOf(m[1].toLowerCase()) + 1];
    else if (m[3]) [y, mo] = [+m[4], SEASONS[m[3].toLowerCase()]];
    else if (m[5]) [y, mo] = [+m[6], +m[5]];
    else [y, mo] = [+m[7], 12]; // bare year: end of that year
    out.push({ at: m.index ?? 0, value: y * 12 + mo - 1, label: m[0] });
  }
  return out;
}

function ym(month: string | undefined): number | null {
  const m = month?.match(/^(\d{4})(?:-(\d{2}))?/);
  return m ? +m[1] * 12 + (m[2] ? +m[2] : 12) - 1 : null;
}

function grad(ctx: Context): Education | undefined {
  // The degree still in progress, else the most recent one.
  const eds = [...ctx.profile.education].sort((a, b) => (ym(b.end) ?? 0) - (ym(a.end) ?? 0));
  return eds[0];
}

function monthLabel(month: string): string {
  const v = ym(month)!;
  const names = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
  return /-\d{2}/.test(month) ? `${names[v % 12]} ${Math.floor(v / 12)}` : month.slice(0, 4);
}

// --- Rules ----------------------------------------------------------------------

const rules: Rule[] = [
  // Sponsorship before authorization: "authorized ... without sponsorship" is about authorization,
  // but "will you require sponsorship" mentions neither "authorized" nor "eligible".
  (q, t, ctx) => {
    if (!/sponsor|visa (support|status)|immigration support|work permit support/.test(t) || !isBool(q)) return null;
    if (/(authori[sz]ed|eligible|legally|right) to work/.test(t) && /without/.test(t)) {
      const { country, stated } = countryIn(t, ctx);
      const ok = Boolean(ctx.profile.work.authorized[country]) && !ctx.profile.work.sponsorship[country];
      return yes(ok, `work in ${country} without sponsorship: ${ok ? "yes" : "no"}`, stated ? "high" : "medium");
    }
    const { country, stated } = countryIn(t, ctx);
    const need = Boolean(ctx.profile.work.sponsorship[country]);
    return yes(need, `sponsorship needed for ${country}: ${need ? "yes" : "no"}`, stated ? "high" : "medium");
  },
  (q, t, ctx) => {
    if (!/(authori[sz]ed|eligible|entitled|permitted|legally able|right) to (work|be employed)/.test(t) || !isBool(q)) return null;
    const { country, stated } = countryIn(t, ctx);
    const ok = Boolean(ctx.profile.work.authorized[country]);
    return yes(ok, `authorized in ${country}: ${ok ? "yes" : "no"}`, stated ? "high" : "medium");
  },
  (q, t, ctx) =>
    /(18|eighteen) years|at least 18|over 18|18 or older|legal (working )?age/.test(t) && isBool(q)
      ? yes(ctx.profile.screening.over18, "profile: over 18")
      : null,
  // Previously worked here?
  (q, t, ctx) => {
    if (q.key !== "previousWorker" && !/(previously|ever|formerly|before|in the past).{0,30}(employed|worked)|(current|former) (employee|intern|worker|contractor)/.test(t)) return null;
    if (!isBool(q) && q.kind !== "choice") return null;
    const named = employerIn(q.text) ?? undefined;
    const names = new Set([...companyVariants(ctx.company), ...companyVariants(named ?? "")]);
    if (!names.size) return null;
    const match = ctx.profile.experience.find((e) => companyVariants(e.company).some((c) => names.has(c)));
    return yes(Boolean(match), match ? `you worked at ${match.company}` : `${named ?? ctx.company} not in your experience`);
  },
  (q, t, ctx) => {
    if (!/\b(relatives?|family members?|related to|spouse|partner)\b/.test(t) || !isBool(q)) return null;
    const names = new Set([...companyVariants(ctx.company), ...companyVariants(employerIn(q.text) ?? "")]);
    const has = ctx.profile.screening.relativesAtEmployers.some((c) => companyVariants(c).some((v) => names.has(v)));
    return yes(has, has ? "relative works here (profile)" : "no relatives listed at this employer", "medium");
  },
  (q, t, ctx) => {
    if (q.key !== "source" && !/how did you (hear|find|learn)|where did you (hear|find|see)|referral source|^source$/.test(t)) return null;
    const [value, ...candidates] = ctx.profile.screening.sources;
    if (!value) return null;
    return { value, candidates, confidence: "high", source: "screening", evidence: "your source preferences" };
  },
  (q, t, ctx) => (/relocat/.test(t) && isBool(q) ? yes(ctx.profile.work.willingToRelocate, "profile: willing to relocate", "medium") : null),
  (q, t, ctx) => {
    if (!/notice period|how much notice|weeks'? notice/.test(t) || !ctx.profile.work.noticePeriod) return null;
    if (q.kind !== "text" && q.kind !== "longtext") return null;
    return { value: ctx.profile.work.noticePeriod, confidence: "high", source: "screening", evidence: "profile: notice period" };
  },
  (q, t, ctx) => {
    if (!/(earliest|available|availability|when can you|able to) (start|to start|date|begin)|start date/.test(t)) return null;
    const start = ctx.profile.work.earliestStart;
    if (q.kind !== "date" && q.kind !== "text" && q.kind !== "longtext") return null;
    if (!start) return null;
    return { value: start, confidence: "medium", source: "screening", evidence: "profile: earliest start" };
  },
  (q, t, ctx) => {
    if (!/salary|compensation|pay expectation|expected pay|desired pay/.test(t) || !ctx.profile.work.salaryExpectation) return null;
    if (q.kind !== "text" && q.kind !== "longtext") return null;
    return { value: ctx.profile.work.salaryExpectation, confidence: "high", source: "screening", evidence: "profile: salary expectation" };
  },
  // Graduation timing.
  (q, t, ctx) => {
    if (!/graduat|completion of (your )?(degree|studies|program)|finish (your )?(degree|studies)/.test(t)) return null;
    const ed = grad(ctx);
    if (!ed?.end) return null;
    const g = ym(ed.end)!;
    const evidence = `graduating ${monthLabel(ed.end)} (${ed.school})`;
    if (q.kind === "date") return { value: ed.end, confidence: "high", source: "screening", evidence };
    if ((q.kind === "text" || q.kind === "longtext") && /when|date|expected|anticipated/.test(t))
      return { value: monthLabel(ed.end), confidence: "high", source: "screening", evidence };
    if (!isBool(q)) return null;
    const dates = monthsIn(t);
    if (!dates.length) return null;
    const before = (re: RegExp, d: Ym) => re.test(t.slice(Math.max(0, d.at - 25), d.at));
    // A bare year spans Jan..Dec; `value` is its December.
    const first = (d: Ym) => (/^\d{4}$/.test(d.label) ? d.value - 11 : d.value);
    let result: boolean | null = null;
    if (dates.length >= 2 && /between|from/.test(t)) result = g >= first(dates[0]) && g <= dates[1].value;
    else {
      const d = dates[0];
      if (before(/on or after|or later/, d)) result = g >= first(d);
      else if (before(/after/, d)) result = g > d.value;
      else if (before(/on or before|no later than|by/, d)) result = g <= d.value;
      else if (before(/before|prior to/, d)) result = g < first(d);
      else if (before(/\bin\b|during/, d)) result = g >= first(d) && g <= d.value;
    }
    return result === null ? null : yes(result, evidence, "medium");
  },
  (q, t, ctx) => {
    if (!/currently (enrolled|a student|pursuing|attending)|returning to school|full-time student/.test(t) || !isBool(q)) return null;
    const ed = grad(ctx);
    const now = ctx.today.getFullYear() * 12 + ctx.today.getMonth();
    const enrolled = Boolean(ed?.end && ym(ed.end)! > now);
    return yes(enrolled, ed ? `${ed.school}, ends ${ed.end ?? "?"}` : "no education listed", "medium");
  },
  (q, t, ctx) => {
    if (!/highest (level of )?(education|degree)|degree level|level of education/.test(t) || q.kind === "longtext" || q.kind === "date") return null;
    const ed = grad(ctx);
    if (!ed) return null;
    const [value, ...candidates] = LEVEL_NAMES[ed.level];
    return { value, candidates: [ed.degree, ...candidates], confidence: "medium", source: "screening", evidence: ed.degree };
  },
  (q, t, ctx) => {
    if (!/\bgpa\b|grade point|cumulative average/.test(t)) return null;
    const gpa = grad(ctx)?.gpa;
    return gpa && (q.kind === "text" || q.kind === "choice") ? { value: gpa, confidence: "high", source: "screening", evidence: "profile: GPA" } : null;
  },
  // "Do you have experience with Python?" — yes if it's in your skills list.
  (q, t, ctx) => {
    if (!isBool(q) || q.kind === "text") return null;
    if (!/(experience|proficien\w*|familiar\w*|knowledge|skilled|comfortable|expertise|worked) (with|in|of|using)|do you (know|have|use)|can you (use|code|program|write)/.test(t)) return null;
    const known = ctx.profile.skills.filter((s) => mentionsWord(t, s));
    if (!known.length) return null;
    return yes(true, `in your skills: ${known.join(", ")}`, "medium");
  },
];

export const screeningResolver: Resolver = {
  name: "screening",
  resolve(questions, ctx) {
    const out = new Map<string, Answer>();
    for (const q of questions) {
      const t = norm(q.text);
      for (const rule of rules) {
        const a = rule(q, t, ctx);
        if (a) {
          if (q.kind === "text" && typeof a.value === "boolean") a.value = a.value ? "Yes" : "No";
          out.set(q.id, a);
          break;
        }
      }
    }
    return out;
  },
};
