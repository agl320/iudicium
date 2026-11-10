// Resumes stored in Supabase (see supabase/resume_schema.sql). Row-level
// security limits every query to the signed-in user's own rows.

import { authRedirect, supabase } from "../lib/supabase";
import type { Resume } from "./types";

export type ResumeMeta = {
  id: string;
  title: string;
  updated_at: string;
  version: number;
};

export type CloudResume = ResumeMeta & { data: Resume };

/** Saved elsewhere (another tab or device) since this copy was loaded. */
export class ConflictError extends Error {
  constructor() {
    super("This resume was changed somewhere else.");
  }
}

function fail(error: { message: string } | null, what: string): void {
  if (error) throw new Error(`${what}: ${error.message}`);
}

export async function listResumes(): Promise<ResumeMeta[]> {
  const { data, error } = await supabase
    .from("resumes")
    .select("id,title,updated_at,version")
    .order("updated_at", { ascending: false });
  fail(error, "Could not load your resumes");
  return (data ?? []) as ResumeMeta[];
}

export async function getResume(id: string): Promise<CloudResume> {
  const { data, error } = await supabase
    .from("resumes")
    .select("id,title,updated_at,version,data")
    .eq("id", id)
    .single();
  fail(error, "Could not open the resume");
  return data as CloudResume;
}

export async function createResume(title: string, resume: Resume): Promise<CloudResume> {
  const { data, error } = await supabase
    .from("resumes")
    .insert({ title: title.slice(0, 120) || "Untitled resume", data: resume })
    .select("id,title,updated_at,version,data")
    .single();
  fail(error, "Could not create the resume");
  return data as CloudResume;
}

/** Saves if nobody else saved since `version`; returns the new version. */
export async function saveResume(id: string, resume: Resume, version: number): Promise<number> {
  const { data, error } = await supabase
    .from("resumes")
    .update({ data: resume, version: version + 1, updated_at: new Date().toISOString() })
    .eq("id", id)
    .eq("version", version)
    .select("version");
  fail(error, "Could not save");
  if (!data || data.length === 0) throw new ConflictError();
  return data[0].version as number;
}

export async function renameResume(id: string, title: string): Promise<void> {
  const { error } = await supabase
    .from("resumes")
    .update({ title: title.slice(0, 120) || "Untitled resume" })
    .eq("id", id);
  fail(error, "Could not rename");
}

export async function deleteResume(id: string): Promise<void> {
  const { error } = await supabase.from("resumes").delete().eq("id", id);
  fail(error, "Could not delete");
}

export async function duplicateResume(id: string): Promise<CloudResume> {
  const original = await getResume(id);
  return createResume(`${original.title} (copy)`, original.data);
}

// --- Account ---------------------------------------------------------------

export async function signIn(email: string, password: string): Promise<void> {
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  fail(error, "Sign in failed");
}

/** Returns true when the address must be confirmed by email first. */
export async function signUp(email: string, password: string): Promise<boolean> {
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: { emailRedirectTo: authRedirect("/resume") },
  });
  fail(error, "Sign up failed");
  return !data.session;
}

export async function sendMagicLink(email: string): Promise<void> {
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: authRedirect("/resume"), shouldCreateUser: false },
  });
  // Unknown address: answer like a success, without revealing who has an account.
  if (error && (error.code === "otp_disabled" || error.status === 422)) return;
  fail(error, "Could not send the link");
}

export async function resendConfirmation(email: string): Promise<void> {
  const { error } = await supabase.auth.resend({
    type: "signup",
    email,
    options: { emailRedirectTo: authRedirect("/resume") },
  });
  fail(error, "Could not resend the confirmation email");
}

export async function sendPasswordReset(email: string): Promise<void> {
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: authRedirect("/account"),
  });
  fail(error, "Could not send the reset email");
}

export async function updatePassword(password: string): Promise<void> {
  const { error } = await supabase.auth.updateUser({ password });
  fail(error, "Could not change the password");
}

export async function signOut(everywhere = false): Promise<void> {
  const { error } = await supabase.auth.signOut({ scope: everywhere ? "global" : "local" });
  fail(error, "Could not sign out");
}

/** Deletes the account and (by cascade) all of its resumes. */
export async function deleteAccount(): Promise<void> {
  const { error } = await supabase.rpc("delete_my_account");
  fail(error, "Could not delete the account");
  await supabase.auth.signOut({ scope: "local" });
}
