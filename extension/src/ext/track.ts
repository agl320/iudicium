// Applications the extension has seen: one record per posting URL, created on
// the first fill and marked submitted when you click the site's Submit. The
// iudicium site reads these (through the bridge) for its Applications page.

export type ApplicationStatus = "started" | "submitted" | "interview" | "offer" | "rejected" | "withdrawn";

export type TrackedApplication = {
  id: string; // stable per posting (normalized URL)
  url: string;
  company: string;
  title: string;
  site: string; // adapter: Workday, Greenhouse...
  profileId: string;
  profileLabel: string;
  resumeId?: string; // site resume the profile came from
  resumeTitle?: string;
  resumeFile?: string; // attached file name
  status: ApplicationStatus;
  startedAt: string;
  submittedAt?: string;
  updatedAt: string;
  filled?: number;
  needs?: number;
};

const MAX = 500;

/** Same posting = same URL without query noise or the step part of Workday/Greenhouse flows. */
export function applicationId(url: string): string {
  try {
    const u = new URL(url);
    const keep = ["gh_jid", "token", "for", "jobId", "jid"];
    const q = [...u.searchParams].filter(([k]) => keep.includes(k)).map(([k, v]) => `${k}=${v}`).join("&");
    const path = u.pathname.replace(/\/(apply|application|applyManually|autofillWithResume|useMyLastApplication)(\/.*)?$/i, "").replace(/\/+$/, "");
    return `${u.hostname}${path}${q ? `?${q}` : ""}`.toLowerCase();
  } catch {
    return url;
  }
}

/** Job title from the page (falls back to the document title). */
export function jobTitle(doc: Document): string {
  const t = doc.title.trim();
  // "Job Application for X at Y" (Greenhouse), "X @ Y" (Ashby), "Y - X" (Lever)
  const gh = t.match(/^job application for (.+?) at .+$/i)?.[1];
  if (gh) return gh;
  const ashby = t.match(/^(.+?)\s+@\s+.+$/)?.[1];
  if (ashby) return ashby;
  const sel = '[data-automation-id="jobPostingHeader"], .posting-headline h2, .job__title h1, .app-title, h1';
  const h = doc.querySelector(sel)?.textContent?.replace(/\s+/g, " ").trim();
  if (h && h.length < 140) return h;
  const lever = t.split(/\s+[-–]\s+/);
  return (lever.length > 1 ? lever.slice(1).join(" - ") : t).slice(0, 140);
}

export async function loadApplications(): Promise<TrackedApplication[]> {
  const got = (await chrome.storage.local.get("applications")) as { applications?: TrackedApplication[] };
  return got.applications ?? [];
}

export async function saveApplications(list: TrackedApplication[]) {
  const sorted = [...list].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).slice(0, MAX);
  await chrome.storage.local.set({ applications: sorted });
}

/** Create or update the record for this posting. */
export async function track(entry: Omit<TrackedApplication, "id" | "startedAt" | "updatedAt" | "status"> & { status?: ApplicationStatus }) {
  const list = await loadApplications();
  const id = applicationId(entry.url);
  const now = new Date().toISOString();
  const old = list.find((a) => a.id === id);
  const next: TrackedApplication = {
    ...old,
    ...entry,
    id,
    // Never move a submitted application back to "started".
    status: entry.status ?? old?.status ?? "started",
    startedAt: old?.startedAt ?? now,
    submittedAt: entry.status === "submitted" ? (old?.submittedAt ?? now) : old?.submittedAt,
    updatedAt: now,
  };
  if (old?.status && old.status !== "started" && entry.status === undefined) next.status = old.status;
  await saveApplications([next, ...list.filter((a) => a.id !== id)]);
  return next;
}

export async function markSubmitted(url: string) {
  const list = await loadApplications();
  const id = applicationId(url);
  const old = list.find((a) => a.id === id);
  if (!old || old.status !== "started") return;
  const now = new Date().toISOString();
  await saveApplications([{ ...old, status: "submitted", submittedAt: now, updatedAt: now }, ...list.filter((a) => a.id !== id)]);
}
