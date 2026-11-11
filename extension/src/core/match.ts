// Text normalization and fuzzy matching of answers to the options a form offers.

export function norm(s: unknown): string {
  return String(s ?? "")
    .replace(/[*∗]/g, "")
    .replace(/\brequired\b/gi, "")
    .replace(/[‘’]/g, "'")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

const STOP = new Set(["a", "an", "the", "of", "to", "in", "at", "for", "or", "and", "are", "is", "you", "your", "do", "i", "my"]);

export function tokens(s: string): string[] {
  return norm(s)
    .replace(/[^a-z0-9+#.\s]/g, " ")
    .split(/\s+/)
    .filter((t) => t && !STOP.has(t));
}

/** Overlap of two token sets, 0..1 (Dice coefficient). */
export function similarity(a: string, b: string): number {
  const A = new Set(tokens(a));
  const B = new Set(tokens(b));
  if (!A.size || !B.size) return 0;
  let both = 0;
  for (const t of A) if (B.has(t)) both++;
  return (2 * both) / (A.size + B.size);
}

/** Best option for one wanted value: exact, then prefix either way, then
 *  containment, then token overlap. Returns the option's index or -1. */
export function matchOne(options: string[], want: string): number {
  const w = norm(want);
  if (!w) return -1;
  const o = options.map(norm);
  let i = o.indexOf(w);
  if (i >= 0) return i;
  i = o.findIndex((x) => x.startsWith(w) || (x.length >= 3 && w.startsWith(x)));
  if (i >= 0) return i;
  i = o.findIndex((x) => x.includes(w));
  if (i >= 0) return i;
  let best = -1;
  let score = 0.6;
  o.forEach((x, k) => {
    const s = similarity(x, w);
    if (s > score) {
      score = s;
      best = k;
    }
  });
  return best;
}

/** First wanted value (in order) that the form offers. */
export function matchOption(options: string[], wants: string[]): number {
  for (const w of wants) {
    const i = matchOne(options, w);
    if (i >= 0) return i;
  }
  return -1;
}

const YES = /^(yes|y|true|i do|i am|i have|i will|i can)\b/i;
const NO = /^(no|n|false|i do not|i don't|i am not|i have not|i will not|i cannot|none)\b/i;

/** Index of the "Yes" (or "No") option among e.g. ["Yes", "No, I will not..."]. */
export function yesNoOption(options: string[], yes: boolean): number {
  const re = yes ? YES : NO;
  const other = yes ? NO : YES;
  return options.findIndex((o) => re.test(norm(o)) && !other.test(norm(o)));
}

export function isYesNoOptions(options: string[] | undefined): boolean {
  if (!options) return false;
  const real = options.filter((o) => !isPlaceholder(o));
  return real.length >= 2 && real.length <= 3 && yesNoOption(real, true) >= 0 && yesNoOption(real, false) >= 0;
}

export function isPlaceholder(option: string): boolean {
  return /^(select one|select|choose|--|please select)/i.test(norm(option)) || norm(option) === "";
}

/** Question text reduced to a reusable key: lowercase, no punctuation, the
 *  employer's name replaced by {company}. */
export function fingerprint(question: string, company: string): string {
  let s = norm(question);
  const names = companyVariants(company);
  for (const n of names) s = s.split(n).join("{company}");
  // "employed by Acme Corp?" when the adapter didn't know the company name
  s = s.replace(/\b(employed by|worked (?:for|at)|work(?:ing)? (?:for|at)|employee of|employees of|join|joining) ([a-z0-9&.,' -]{2,40}?)(\?|$| before| previously| in the past)/, "$1 {company}$3");
  return s.replace(/[^a-z0-9{}+# ]/g, " ").replace(/\s+/g, " ").trim();
}

export function companyVariants(company: string): string[] {
  const c = norm(company);
  if (!c) return [];
  const base = c.replace(/\b(inc|corp|corporation|ltd|limited|llc|co|company)\.?$/g, "").trim();
  return [...new Set([c, base].filter((x) => x.length >= 2))].sort((a, b) => b.length - a.length);
}

/** "Have you worked for Acme Corp as an intern?" → "Acme Corp". */
export function employerIn(question: string): string | null {
  const m = question.match(
    /(?:employed by|worked (?:for|at)|employee of|employees of|work(?:ing)? (?:for|at))\s+(.+?)(?=\s+(?:as|in|before|previously|during|or|and|at any)\b|\s*[?,*.(]|$)/i,
  );
  return m ? m[1].trim() : null;
}

export function mentionsWord(text: string, word: string): boolean {
  const esc = word.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(^|[^a-z0-9+#])${esc}($|[^a-z0-9+#])`, "i").test(text);
}
