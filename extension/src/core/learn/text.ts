// Turning question text into something comparable: synonyms folded into one
// token, light stemming, negation tracked separately, and "entities" (names,
// numbers, dates) pulled out so two questions that differ only in them
// ("experience with Docker" / "with Kubernetes") are never treated as the same.

import { companyVariants, employerIn, norm } from "../match";

/** Canonical token ← words that mean the same thing in application forms. */
const SYNONYMS: Record<string, string[]> = {
  sponsor: ["sponsor", "sponsorship", "sponsored", "sponsoring", "visa", "visas", "h1b", "h-1b", "tn", "immigration"],
  authorized: ["authorized", "authorised", "authorization", "authorisation", "eligible", "eligibility", "entitled", "permitted", "legally", "lawfully", "allowed", "right"],
  work: ["work", "working", "worked", "join", "joining", "employ", "employed", "employee", "employees", "employment", "job", "jobs", "role", "position"],
  require: ["require", "requires", "required", "requirement", "need", "needs", "needed", "necessary"],
  previous: ["previous", "previously", "former", "formerly", "before", "ever", "past", "prior"],
  relative: ["relative", "relatives", "family", "related", "spouse", "partner", "sibling", "parent"],
  age: ["18", "eighteen", "age", "adult"],
  relocate: ["relocate", "relocation", "relocating", "move", "moving"],
  salary: ["salary", "compensation", "pay", "wage", "wages", "remuneration"],
  start: ["start", "starting", "begin", "commence", "available", "availability", "earliest"],
  graduate: ["graduate", "graduating", "graduation", "graduated"],
  degree: ["degree", "education", "qualification", "diploma"],
  experience: ["experience", "experienced", "familiar", "familiarity", "proficient", "proficiency", "knowledge", "skilled", "skill", "skills", "expertise", "comfortable"],
  hear: ["hear", "heard", "learn", "learned", "find", "found", "discover", "referral", "referred", "source"],
  gpa: ["gpa", "cgpa", "grade", "grades"],
  citizen: ["citizen", "citizenship", "national", "nationality", "resident", "residency"],
  clearance: ["clearance", "clearances", "cleared", "security"],
  travel: ["travel", "traveling", "travelling"],
  onsite: ["onsite", "on-site", "office", "in-person", "hybrid"],
  company: ["company", "employer", "organization", "organisation", "firm", "{company}"],
  want: ["want", "wants", "like", "wish", "interested", "interest", "interests", "excite", "excites", "excited", "motivate", "motivates", "motivated", "appeal", "appeals", "attract", "attracts", "drawn"],
  willing: ["willing", "open", "prepared", "happy", "comfortable"],
  why: ["why", "reason", "reasons"],
  year: ["year", "years", "yr", "yrs"],
  expect: ["expect", "expected", "expecting", "expectation", "expectations", "desired", "desire", "target", "anticipated"],
  notice: ["notice", "resignation"],
};

const CANON = new Map<string, string>();
for (const [canon, words] of Object.entries(SYNONYMS)) for (const w of words) CANON.set(w, canon);

/** Words that say little about which question this is. */
const GENERIC = new Set([
  "you", "your", "do", "does", "did", "are", "is", "was", "were", "be", "been", "have", "has", "had", "any", "will", "would",
  "please", "select", "the", "a", "an", "of", "to", "in", "for", "with", "on", "at", "this", "that", "which", "following",
  "best", "describe", "describes", "currently", "current", "future", "now", "able", "can", "could", "time", "i", "my", "me",
  "or", "and", "if", "as", "by", "from", "we", "our", "us", "what", "how", "who", "when", "where", "there", "it", "its",
  "work", "company", "require", "yes", "anyone", "someone", "anybody", "much", "many", "give", "hold", "possess", "period",
  "about", "out", "get", "need", "let", "know", "tell", "kindly", "indicate", "confirm", "state", "provide",
]);

/** Country names and adjectives folded to one form before anything else. */
const PLACES: [RegExp, string][] = [
  [/\b(the\s+)?united states( of america)?\b|\bu\.s\.a?\.?(?=\s|$|[?,])|\busa\b|\bamerican\b/gi, "USA"],
  [/\bUS\b/g, "USA"], // case-sensitive: "work for us" is not the country
  [/\bcanadian\b/gi, "Canada"],
  [/\b(the\s+)?united kingdom\b|\bu\.k\.(?=\s|$|[?,])|\bbritish\b|\buk\b/gi, "UK"],
  [/\baustralian\b/gi, "Australia"],
  [/\bindian\b/gi, "India"],
];

const NEGATION = /\b(not|no|never|without|none|neither|nor|cannot|unable)\b|n't\b/g;

const MONTHS = /^(jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*$/;

function stem(w: string): string {
  if (w.length <= 4 || /\d/.test(w)) return w;
  return w
    .replace(/ies$/, "y")
    .replace(/(ational|ation|ations)$/, "ate")
    .replace(/(ments?|ings?|edly|ed|ly|ness|es|s)$/, "")
    .replace(/(.)\1$/, "$1");
}

export function canon(word: string): string {
  const w = word.toLowerCase();
  return CANON.get(w) ?? CANON.get(stem(w)) ?? stem(w);
}

export type Normalized = {
  tokens: string[]; // canonical, negations removed
  polarity: 0 | 1; // odd number of negations = 1
  entities: Set<string>; // names, numbers, dates, tech terms
  joined: string; // tokens as one string, for character n-grams
};

/** Question text → comparable form. The employer's name becomes {company}. */
export function normalize(text: string, company = ""): Normalized {
  let t = String(text ?? "").replace(/[*∗]/g, " ");
  // The employer, whether the adapter knew it or the question names it ("employed by Globex").
  const names = [...companyVariants(company), ...companyVariants(employerIn(t) ?? "")].sort((a, b) => b.length - a.length);
  for (const c of names) t = t.replace(new RegExp(`\\b${escape(c)}\\b`, "gi"), " {company} ");
  for (const [re, to] of PLACES) t = t.replace(re, to);
  const lower = norm(t);
  const polarity = ((lower.match(NEGATION) ?? []).length % 2) as 0 | 1;

  // Entities from the raw text: capitalized words not at the start of a
  // sentence, words with symbols (C++, C#, .NET, Node.js), numbers, months.
  const entities = new Set<string>();
  const raw = t.split(/\s+/).filter(Boolean);
  raw.forEach((w, i) => {
    const clean = w.replace(/^[^\w+#.]+|[^\w+#]+$/g, "");
    if (!clean || clean === "{company}") return;
    const lw = clean.toLowerCase();
    const sentenceStart = i === 0 || /[.?!:]$/.test(raw[i - 1]);
    if (/\d/.test(clean) && !/^18$/.test(clean)) entities.add(lw);
    else if (MONTHS.test(lw)) entities.add(lw.slice(0, 3));
    else if (/[+#]|\.\w/.test(clean)) entities.add(lw);
    else if (/^[A-Z]/.test(clean) && !sentenceStart && !CANON.has(lw) && !GENERIC.has(lw) && clean.length > 1 && !/^I$/.test(clean)) entities.add(lw);
  });

  const tokens = lower
    .replace(NEGATION, " ")
    .replace(/[^a-z0-9+#.{}\s-]/g, " ")
    .split(/\s+/)
    .map((w) => w.replace(/^[.-]+|[.-]+$/g, ""))
    .filter((w) => w && w !== "-")
    .map(canon);
  return { tokens, polarity, entities, joined: tokens.join(" ") };
}

/** Filler words in the form tokens take after stemming/synonyms ("describes" → "describ"). */
const GENERIC_TOKENS = new Set([...GENERIC].flatMap((w) => [w, canon(w)]));
export const isGeneric = (token: string) => GENERIC_TOKENS.has(token);

function escape(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Character trigrams of a string (padded), for typo/word-form tolerance. */
export function trigrams(s: string): Set<string> {
  const p = `  ${s} `;
  const out = new Set<string>();
  for (let i = 0; i < p.length - 2; i++) out.add(p.slice(i, i + 3));
  return out;
}

export function jaccard<T>(a: Set<T>, b: Set<T>): number {
  if (!a.size && !b.size) return 1;
  let both = 0;
  for (const x of a) if (b.has(x)) both++;
  return both / (a.size + b.size - both);
}

/** "Do you have experience with Kubernetes?" → "kubernetes". One skill only;
 *  "Python or Java" is ambiguous and skipped. */
export function skillIn(question: string): string | null {
  const m = question.match(
    /(?:experience|proficien\w*|familiar\w*|knowledge|skilled|expertise|comfortable|worked|working)\s+(?:with|in|of|using)\s+(.+?)\s*(?:\?|$|\bat\b|\bin a\b|\bfor\b|\bprofessionally\b)/i,
  );
  if (!m) return null;
  const s = m[1].replace(/^(the|a|an|professional|academic|hands-on|using)\s+/i, "").trim();
  if (!s || /,|\bor\b|\band\b|\//i.test(s) || s.split(/\s+/).length > 3) return null;
  return s.toLowerCase();
}
