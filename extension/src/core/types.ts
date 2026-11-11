// The shapes every part of the autofill shares.
//
//   site adapter  --reads-->  Question[]  --resolvers-->  Answer  --driver writes-->  page
//
// Adapters and drivers know about the page but not where answers come from;
// resolvers know about the profile but never touch the page.

import type { Profile, SavedAnswer } from "./profile";

export type QuestionKind =
  | "text" // one-line input
  | "longtext" // textarea / rich text
  | "yesno" // single checkbox or toggle
  | "choice" // pick one: dropdown, radio group
  | "multi" // pick several: checkbox group
  | "search" // type to search, pick from server results
  | "date"
  | "file"
  | "unknown";

/** Fields every site has, under one name. Adapters translate their own ids
 *  (Workday's "legalName--firstName", ...) into these; label matching is the
 *  fallback when a site gives no usable id. */
export type CanonicalKey =
  | "firstName"
  | "middleName"
  | "lastName"
  | "fullName"
  | "hasPreferredName"
  | "preferredFirstName"
  | "email"
  | "phone"
  | "phoneType"
  | "phoneCountryCode"
  | "phoneExtension"
  | "addressLine1"
  | "addressLine2"
  | "city"
  | "region"
  | "postalCode"
  | "country"
  | "linkedin"
  | "github"
  | "website"
  | "previousWorker"
  | "source"
  | "todayDate";

export type Question = {
  id: string;
  text: string; // label / legend, without "*" and "Required"
  kind: QuestionKind;
  options?: string[]; // known choices (dropdown, radio, checkbox group)
  required: boolean;
  maxLength?: number;
  key?: CanonicalKey;
};

export type Confidence = "high" | "medium" | "low";
export type AnswerSource = "profile" | "eeo" | "screening" | "saved" | "guard" | "ai" | "draft";
export type AnswerValue = string | string[] | boolean;

export type Answer = {
  value: AnswerValue;
  /** For choice/search: more values to try, in order, if `value` isn't offered. */
  candidates?: string[];
  confidence: Confidence;
  source: AnswerSource;
  evidence?: string; // shown in the review panel
  /** Claimed but left for the person (legal text, consent...). */
  manual?: boolean;
};

export type Context = {
  profile: Profile;
  saved: SavedAnswer[];
  company: string; // employer, as best the adapter can tell
  today: Date;
};

/** Resolvers run in order; each claims what it can and passes on the rest.
 *  Batched so an AI resolver can answer a whole page in one call. */
export interface Resolver {
  name: string;
  resolve(questions: Question[], ctx: Context): Promise<Map<string, Answer>> | Map<string, Answer>;
}

export type WriteResult = { ok: boolean; shown?: string; note?: string };

/** One per widget type. `el` is the field's container on the page. */
export interface FieldDriver {
  name: string;
  detect(el: Element): boolean;
  kind(el: Element): QuestionKind;
  options?(el: Element): Promise<string[] | undefined>;
  read(el: Element): AnswerValue | null; // null = empty
  write(el: Element, answer: Answer): Promise<WriteResult>;
}

export type Field = {
  el: Element;
  driver: FieldDriver;
  question: Question;
};

export type ReportStatus = "filled" | "kept" | "needs" | "failed";

export type ReportItem = {
  question: string;
  kind: QuestionKind;
  status: ReportStatus;
  source?: AnswerSource;
  confidence?: Confidence;
  detail?: string; // what was written, or why not
  el?: Element;
  /** For "remember my answers". */
  fingerprintable?: boolean;
  field?: Field;
  written?: AnswerValue; // what the field showed right after filling
};
