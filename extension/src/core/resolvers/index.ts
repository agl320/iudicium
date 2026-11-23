import type { Resolver } from "../types";
import { eeoResolver } from "./eeo";
import { filesResolver } from "./files";
import { guardResolver } from "./guard";
import { profileResolver } from "./profile";
import { memoryResolver } from "./memory";
import { screeningResolver } from "./screening";

/** Order matters: the first resolver to answer a question wins.
 *  - guard first, so legal/consent questions never reach anything else
 *  - eeo before saved/AI, so self-identification stays deterministic and private
 *  - memory before screening, so answers you gave (or corrected) override the rules */
export const RESOLVERS: Resolver[] = [
  filesResolver, // resume / cover letter from the profile; other uploads fall to the guard
  guardResolver,
  profileResolver,
  eeoResolver,
  memoryResolver,
  screeningResolver,
  // aiShortResolver,  — Gemini via Supabase Edge Function (later)
  // aiDraftResolver,  — long answers (later)
];
