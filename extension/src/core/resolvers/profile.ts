// Contact details and links: answered straight from the profile, by the key
// the adapter supplied or, failing that, by the field's label.

import type { Answer, CanonicalKey, Context, Question, Resolver } from "../types";
import { norm } from "../match";
import { LEVEL_NAMES } from "../profile";

const LABELS: [RegExp, CanonicalKey][] = [
  [/^(legal )?(first|given) name/, "firstName"],
  [/^middle name/, "middleName"],
  [/^(legal )?(last|family) name|^surname/, "lastName"],
  [/^(full |legal |your )?name$/, "fullName"],
  [/preferred (first )?name/, "preferredFirstName"],
  [/e-?mail/, "email"],
  [/phone (device )?type/, "phoneType"],
  [/country (phone )?code|phone code|dialing code/, "phoneCountryCode"],
  [/^(phone )?extension/, "phoneExtension"],
  [/^(phone|mobile|cell|telephone)( number)?$/, "phone"],
  [/address line 1|street address|^address$/, "addressLine1"],
  [/address line 2/, "addressLine2"],
  [/^(current )?location$|^(current )?location \(?city|where are you (currently )?(located|based)|where do you (currently )?(live|reside)|where (do|will) you plan (on|to) work(ing)? from|^city,? (state|province)/, "location"],
  [/^(city|town)/, "city"],
  [/^current (company|employer|organi[sz]ation)|^(most recent|current or (most )?recent) (company|employer)/, "currentCompany"],
  [/^current (job )?title|^current (role|position)|^(most recent|current or (most )?recent) (job )?title/, "currentTitle"],
  [/^(state|province|region)|state\/province/, "region"],
  [/postal|zip/, "postalCode"],
  [/^country( of residence)?$|^country\/(territory|region)|(current )?country of residence|country (in which|where) you (are )?(currently )?(located|live|reside|based)|which country (are you|do you) (currently )?(located|live|reside|based|in)/, "country"],
  [/^(school|university|college|institution)( name)?$|which (university|school|college)|(university|school|college) (are you|did you) (currently )?(attend|attending|last attend)/, "school"],
  [/^degree( type)?$|degree (are you|did you) (pursuing|obtain|earn)|which degree/, "degree"],
  [/^(field of study|major|discipline|area of study)$|what is your (field of study|major)/, "fieldOfStudy"],
  [/linkedin/, "linkedin"],
  [/github/, "github"],
  [/website|portfolio|personal (site|url)/, "website"],
  [/^date$|today'?s date|date signed|signature date/, "todayDate"],
];

export function keyFromLabel(text: string): CanonicalKey | undefined {
  const t = norm(text);
  return LABELS.find(([re]) => re.test(t))?.[1];
}

function iso(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

function answerFor(key: CanonicalKey, q: Question, ctx: Context): Answer | null {
  const p = ctx.profile.person;
  const a = p.address;
  const v = (value: string | boolean | undefined, extra: Partial<Answer> = {}): Answer | null =>
    value === undefined || value === "" ? null : { value, confidence: "high", source: "profile", evidence: `profile: ${key}`, ...extra };
  switch (key) {
    case "firstName":
      return v(p.firstName);
    case "middleName":
      return v(p.middleName);
    case "lastName":
      return v(p.lastName);
    case "fullName":
      return v([p.firstName, p.middleName, p.lastName].filter(Boolean).join(" "));
    case "hasPreferredName":
      return v(Boolean(p.preferredFirstName));
    case "preferredFirstName":
      return q.kind === "yesno" ? v(Boolean(p.preferredFirstName)) : v(p.preferredFirstName);
    case "email":
      return v(p.email);
    case "phone":
      return v(p.phone);
    case "phoneType":
      return v(p.phoneType, { candidates: ["Mobile", "Cell"] });
    case "phoneCountryCode":
      return v(`${p.phoneCountry} (+1)`, { candidates: [p.phoneCountry] });
    case "phoneExtension":
      return null;
    case "addressLine1":
      return v(a.line1);
    case "addressLine2":
      return v(a.line2);
    case "city":
      return v(a.city);
    case "region":
      return v(a.region);
    case "postalCode":
      return v(a.postalCode);
    case "country":
      return v(a.country);
    case "linkedin":
      return v(ctx.profile.links.linkedin);
    case "github":
      return v(ctx.profile.links.github);
    case "website":
      return v(ctx.profile.links.website ?? ctx.profile.links.github);
    case "location": {
      // Search boxes match the longest form they offer; typed boxes get "City, Region".
      const full = [a.city, a.region, a.country].filter(Boolean).join(", ");
      return v(q.kind === "text" ? `${a.city}, ${a.region}` : full, {
        candidates: [full, `${a.city}, ${a.region}`, `${a.city}, ${a.country}`, a.city].filter((x) => x && !x.startsWith(",")),
      });
    }
    case "currentCompany":
    case "currentTitle": {
      const jobs = ctx.profile.experience;
      const now = jobs.find((e) => !e.end) ?? [...jobs].sort((x, y) => (y.end ?? "").localeCompare(x.end ?? ""))[0];
      if (!now) return null;
      return v(key === "currentCompany" ? now.company : now.title, { evidence: `profile: ${now.end ? "most recent" : "current"} job` });
    }
    case "school":
    case "degree":
    case "fieldOfStudy": {
      // Most recent (or current) program.
      const ed = [...ctx.profile.education].sort((x, y) => (y.end ?? "9999").localeCompare(x.end ?? "9999"))[0];
      if (!ed) return null;
      const evidence = `profile: ${ed.school}`;
      if (key === "school") return v(ed.school, { evidence, candidates: q.kind === "text" ? [] : ["Other"] });
      if (key === "degree") return v(ed.degree, { evidence, candidates: [...LEVEL_NAMES[ed.level], "Other"] });
      return v(ed.field, { evidence, candidates: q.kind === "text" ? [] : ["Other"] });
    }
    case "todayDate":
      return v(iso(ctx.today), { evidence: "today" });
    case "previousWorker":
    case "source":
      return null; // screening resolver
  }
}

export const profileResolver: Resolver = {
  name: "profile",
  resolve(questions, ctx) {
    const out = new Map<string, Answer>();
    for (const q of questions) {
      if (q.kind === "longtext") continue;
      const key = q.key ?? keyFromLabel(q.text);
      if (!key) continue;
      const answer = answerFor(key, q, ctx);
      if (answer) out.set(q.id, answer);
    }
    return out;
  },
};
