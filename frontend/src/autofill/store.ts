// Dashboard data: tracked applications (merged from the extension, plus ones
// added by hand) and the applicant facts kept per resume. Signed in, it lives
// in Supabase (supabase/autofill_schema.sql, table autofill_items); signed out,
// or if that table hasn't been created yet, in this browser.

import { supabase } from "../lib/supabase";
import type { ApplicantFacts } from "./profile";
import type { TrackedApplication } from "./extension";

export type Kind = "application" | "facts";
type Row<T> = { key: string; data: T; updated_at: string };

const LOCAL = "iudicium.autofill.v1";

function readLocal(): Record<string, Record<string, unknown>> {
  try {
    return JSON.parse(localStorage.getItem(LOCAL) ?? "{}");
  } catch {
    return {};
  }
}

function writeLocal(all: Record<string, Record<string, unknown>>) {
  try {
    localStorage.setItem(LOCAL, JSON.stringify(all));
  } catch {
    /* storage full: keep going in memory */
  }
}

export type Store = {
  where: "cloud" | "browser";
  /** Why it fell back to the browser, if it did. */
  notice?: string;
  list<T>(kind: Kind): Promise<Record<string, T>>;
  put<T>(kind: Kind, key: string, data: T): Promise<void>;
  remove(kind: Kind, key: string): Promise<void>;
};

const browserStore: Store = {
  where: "browser",
  async list<T>(kind: Kind) {
    return (readLocal()[kind] ?? {}) as Record<string, T>;
  },
  async put(kind, key, data) {
    const all = readLocal();
    all[kind] = { ...(all[kind] ?? {}), [key]: data };
    writeLocal(all);
  },
  async remove(kind, key) {
    const all = readLocal();
    if (all[kind]) delete all[kind][key];
    writeLocal(all);
  },
};

const cloudStore: Store = {
  where: "cloud",
  async list<T>(kind: Kind) {
    const { data, error } = await supabase.from("autofill_items").select("key,data,updated_at").eq("kind", kind);
    if (error) throw new Error(error.message);
    return Object.fromEntries((data as Row<T>[]).map((r) => [r.key, r.data]));
  },
  async put(kind, key, data) {
    const { error } = await supabase
      .from("autofill_items")
      .upsert({ kind, key, data, updated_at: new Date().toISOString() }, { onConflict: "owner,kind,key" });
    if (error) throw new Error(error.message);
  },
  async remove(kind, key) {
    const { error } = await supabase.from("autofill_items").delete().eq("kind", kind).eq("key", key);
    if (error) throw new Error(error.message);
  },
};

/** Cloud when signed in and the table exists, else this browser. */
export async function openStore(signedIn: boolean): Promise<Store> {
  if (!signedIn) return browserStore;
  const { error } = await supabase.from("autofill_items").select("key").limit(1);
  if (!error) return cloudStore;
  return {
    ...browserStore,
    notice: /relation|does not exist|schema cache/i.test(error.message)
      ? "Cloud sync for applications isn't set up yet (run supabase/autofill_schema.sql). Saving in this browser for now."
      : `Couldn't reach your account (${error.message}). Saving in this browser for now.`,
  };
}

export type { ApplicantFacts, TrackedApplication };
