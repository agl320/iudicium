import type { Resolver } from "../types";
import { eeoResolver } from "./eeo";
import { guardResolver } from "./guard";
import { profileResolver } from "./profile";
import { savedResolver } from "./saved";
import { screeningResolver } from "./screening";

/** Order matters: the first resolver to answer a question wins.
 *  - guard first, so legal/consent questions never reach anything else
 *  - eeo before saved/AI, so self-identification stays deterministic and private
 *  - saved before screening, so your own past answers override the rules */
export const RESOLVERS: Resolver[] = [
  guardResolver,
  profileResolver,
  eeoResolver,
  savedResolver,
  screeningResolver,
  // aiShortResolver,  — Gemini via Supabase Edge Function (later)
  // aiDraftResolver,  — long answers (later)
];
