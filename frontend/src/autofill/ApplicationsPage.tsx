// #/applications: the account's job applications in one place.
//
//   resume (builder)  ──Send to extension──▶  autofill profile in the extension
//   extension fills a form ──records──▶ application ──shows up here──▶ track status
//
// Works signed out too (one resume in this browser, data kept locally).

import { type FormEvent, type ReactNode, useCallback, useEffect, useMemo, useState } from "react";
import { AuthProvider } from "../auth/AuthProvider";
import { useAuth } from "../auth/context";
import { SiteHeader } from "../components/SiteHeader";
import { getResume, listResumes, type ResumeMeta } from "../resume/cloud";
import { localResume } from "../resume/store";
import type { Resume } from "../resume/types";
import { type ApplicationStatus, type TrackedApplication, useExtension } from "./extension";
import { type ApplicantFacts, buildProfile, defaultFacts, fromResume, toBase64 } from "./profile";
import { openStore, type Store } from "./store";

const STATUSES: { key: ApplicationStatus; label: string; tone: string }[] = [
  { key: "started", label: "Started", tone: "bg-neutral-100 text-neutral-700" },
  { key: "submitted", label: "Applied", tone: "bg-sky-50 text-sky-700" },
  { key: "interview", label: "Interview", tone: "bg-amber-50 text-amber-700" },
  { key: "offer", label: "Offer", tone: "bg-emerald-50 text-emerald-700" },
  { key: "rejected", label: "Rejected", tone: "bg-red-50 text-red-700" },
  { key: "withdrawn", label: "Withdrawn", tone: "bg-neutral-50 text-neutral-500" },
];
const toneOf = (s: ApplicationStatus) => STATUSES.find((x) => x.key === s)?.tone ?? "";

const day = (iso?: string) => (iso ? new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" }) : "—");

type ResumeSource = { id: string; title: string; updated?: string; load: () => Promise<Resume> };

function Section({ title, description, action, children }: { title: string; description?: ReactNode; action?: ReactNode; children: ReactNode }) {
  return (
    <section className="border border-line bg-paper p-5 shadow-soft">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="text-[15px] font-semibold">{title}</h2>
          {description ? <p className="mt-1 max-w-2xl text-xs leading-relaxed text-neutral-500">{description}</p> : null}
        </div>
        {action}
      </div>
      <div className="mt-4">{children}</div>
    </section>
  );
}

function ApplicationsInner() {
  const { user, loading } = useAuth();
  const ext = useExtension();
  const [store, setStore] = useState<Store | null>(null);
  const [apps, setApps] = useState<Record<string, TrackedApplication>>({});
  const [facts, setFacts] = useState<Record<string, ApplicantFacts>>({});
  const [resumes, setResumes] = useState<ResumeSource[] | null>(null);
  const [error, setError] = useState("");

  // Storage: cloud when signed in (and set up), else this browser.
  useEffect(() => {
    if (loading) return;
    let cancelled = false;
    void openStore(!!user).then(async (s) => {
      if (cancelled) return;
      setStore(s);
      try {
        setApps(await s.list<TrackedApplication>("application"));
        setFacts(await s.list<ApplicantFacts>("facts"));
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      }
    });
    return () => {
      cancelled = true;
    };
  }, [user, loading]);

  // Resumes: the account's, or the one kept in this browser.
  useEffect(() => {
    if (loading) return;
    if (!user) {
      const local = localResume.load();
      setResumes(local ? [{ id: "local", title: local.name ? `${local.name} (this browser)` : "Resume (this browser)", load: async () => local }] : []);
      return;
    }
    listResumes()
      .then((list: ResumeMeta[]) => setResumes(list.map((m) => ({ id: m.id, title: m.title, updated: m.updated_at, load: async () => (await getResume(m.id)).data }))))
      .catch((err: unknown) => setError(err instanceof Error ? err.message : String(err)));
  }, [user, loading]);

  // New or newer applications from the extension are copied into the dashboard.
  useEffect(() => {
    if (!store || ext.status !== "ready") return;
    const fresh = ext.applications.filter((a) => !apps[a.id] || a.updatedAt > apps[a.id].updatedAt);
    if (!fresh.length) return;
    void Promise.all(fresh.map((a) => store.put("application", a.id, a))).then(() =>
      setApps((cur) => ({ ...cur, ...Object.fromEntries(fresh.map((a) => [a.id, a])) })),
    );
  }, [store, ext.status, ext.applications, apps]);

  const saveApp = useCallback(
    async (a: TrackedApplication) => {
      if (!store) return;
      const next = { ...a, updatedAt: new Date().toISOString() };
      setApps((cur) => ({ ...cur, [a.id]: next }));
      await store.put("application", a.id, next);
      if (ext.status === "ready" && ext.applications.some((x) => x.id === a.id)) {
        await ext.updateApplication({ id: a.id, status: next.status, submittedAt: next.submittedAt }).catch(() => {});
      }
    },
    [store, ext],
  );

  const removeApp = useCallback(
    async (id: string) => {
      if (!store || !confirm("Remove this application from the tracker?")) return;
      setApps((cur) => {
        const { [id]: _gone, ...rest } = cur;
        void _gone;
        return rest;
      });
      await store.remove("application", id);
      if (ext.applications.some((x) => x.id === id)) await ext.removeApplication(id).catch(() => {});
    },
    [store, ext],
  );

  const saveFacts = useCallback(
    async (resumeId: string, f: ApplicantFacts) => {
      setFacts((cur) => ({ ...cur, [resumeId]: f }));
      await store?.put("facts", resumeId, f);
    },
    [store],
  );

  return (
    <div className="min-h-screen text-neutral-900">
      <SiteHeader />
      <main className="mx-auto max-w-5xl space-y-4 px-4 py-10">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold tracking-tight">Applications</h1>
            <p className="mt-1 text-xs text-neutral-500">
              Resumes become autofill profiles in the extension; every form it fills shows up here to track.
              {store ? ` Saved ${store.where === "cloud" ? "to your account" : "in this browser"}.` : ""}
            </p>
          </div>
          <ExtensionBadge status={ext.status} version={ext.version} />
        </div>
        {store?.notice ? <p className="rounded-lg border border-line bg-wash px-3 py-2 text-xs">{store.notice}</p> : null}
        {!user && !loading ? (
          <p className="rounded-lg border border-line bg-wash px-3 py-2 text-xs">
            Signed out: using the resume in this browser. <a className="underline" href="#/login">Sign in</a> to use all your resumes and keep this
            tracker in your account.
          </p>
        ) : null}
        {error ? <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">{error}</p> : null}

        <Tracker apps={Object.values(apps)} onSave={saveApp} onRemove={removeApp} />

        <Section
          title="Autofill profiles"
          description="One per resume: its experience, education, skills and contact details, plus the answers a resume doesn't hold. Sending it also attaches the resume (as .docx) to upload fields."
        >
          {resumes === null ? (
            <p className="text-xs text-neutral-400">Loading…</p>
          ) : resumes.length === 0 ? (
            <p className="text-xs text-neutral-500">
              No resume yet. <a className="underline" href="#/resume">Make one in the resume builder</a>.
            </p>
          ) : (
            <ul className="divide-y divide-neutral-100 border border-neutral-200">
              {resumes.map((r) => (
                <ProfileRow
                  key={r.id}
                  source={r}
                  facts={facts[r.id] ?? defaultFacts(r.title)}
                  onFacts={(f) => saveFacts(r.id, f)}
                  ext={ext}
                />
              ))}
            </ul>
          )}
        </Section>

        <HowItWorks missing={ext.status === "missing"} />
      </main>
    </div>
  );
}

function ExtensionBadge({ status, version }: { status: string; version?: string }) {
  const label = status === "ready" ? `Extension connected · v${version}` : status === "checking" ? "Looking for the extension…" : "Extension not detected";
  const dot = status === "ready" ? "bg-emerald-500" : status === "checking" ? "bg-neutral-300" : "bg-amber-500";
  return (
    <span className="inline-flex items-center gap-2 rounded-full border border-line bg-paper px-3 py-1 text-xs" data-testid="ext-status">
      <span className={`size-2 rounded-full ${dot}`} />
      {label}
    </span>
  );
}

// --- Tracker ----------------------------------------------------------------------------

function Tracker({ apps, onSave, onRemove }: { apps: TrackedApplication[]; onSave: (a: TrackedApplication) => Promise<void>; onRemove: (id: string) => Promise<void> }) {
  const [filter, setFilter] = useState<ApplicationStatus | "all">("all");
  const [query, setQuery] = useState("");
  const [adding, setAdding] = useState(false);
  const sorted = useMemo(() => [...apps].sort((a, b) => (b.submittedAt ?? b.startedAt).localeCompare(a.submittedAt ?? a.startedAt)), [apps]);
  const counts = useMemo(() => Object.fromEntries(STATUSES.map((s) => [s.key, apps.filter((a) => a.status === s.key).length])), [apps]);
  const q = query.trim().toLowerCase();
  const shown = sorted.filter((a) => (filter === "all" || a.status === filter) && (!q || `${a.company} ${a.title} ${a.site}`.toLowerCase().includes(q)));

  return (
    <Section
      title="Tracker"
      description="Added when the extension fills an application; marked Applied when you click the form's Submit. Update the status as you hear back."
      action={
        <button type="button" className="btn btn-sm" onClick={() => setAdding((v) => !v)}>
          {adding ? "Cancel" : "Add manually"}
        </button>
      }
    >
      {adding ? (
        <AddForm
          onAdd={async (a) => {
            await onSave(a);
            setAdding(false);
          }}
        />
      ) : null}
      <div className="mb-3 flex flex-wrap items-center gap-1.5">
        <Chip on={filter === "all"} onClick={() => setFilter("all")}>
          All <b className="ml-1">{apps.length}</b>
        </Chip>
        {STATUSES.map((s) => (
          <Chip key={s.key} on={filter === s.key} onClick={() => setFilter(s.key)}>
            {s.label} <b className="ml-1">{counts[s.key]}</b>
          </Chip>
        ))}
        <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search company or role" className="field ml-auto h-8 w-56 text-xs" />
      </div>
      {shown.length === 0 ? (
        <p className="rounded-lg border border-dashed border-line px-3 py-6 text-center text-xs text-neutral-500">
          {apps.length ? "Nothing matches." : "No applications yet. Fill one with the extension, or add one by hand."}
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs" data-testid="tracker">
            <thead className="text-[10px] uppercase tracking-wider text-neutral-400">
              <tr>
                <th className="py-2 pr-3 font-medium">Company · role</th>
                <th className="py-2 pr-3 font-medium">Via</th>
                <th className="py-2 pr-3 font-medium">Resume</th>
                <th className="py-2 pr-3 font-medium">Started</th>
                <th className="py-2 pr-3 font-medium">Applied</th>
                <th className="py-2 pr-3 font-medium">Status</th>
                <th />
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100">
              {shown.map((a) => (
                <tr key={a.id} className="align-top">
                  <td className="py-2 pr-3">
                    <a href={a.url} target="_blank" rel="noreferrer" className="font-medium text-neutral-900 hover:underline">
                      {a.company || "Unknown company"}
                    </a>
                    <div className="text-neutral-500">{a.title}</div>
                  </td>
                  <td className="py-2 pr-3 text-neutral-600">
                    {a.site}
                    {a.filled !== undefined ? <div className="text-[10px] text-neutral-400">{a.filled} filled · {a.needs ?? 0} by hand</div> : null}
                  </td>
                  <td className="py-2 pr-3 text-neutral-600">{a.resumeTitle ?? a.profileLabel}</td>
                  <td className="py-2 pr-3 whitespace-nowrap text-neutral-600">{day(a.startedAt)}</td>
                  <td className="py-2 pr-3 whitespace-nowrap text-neutral-600">{day(a.submittedAt)}</td>
                  <td className="py-2 pr-3">
                    <select
                      value={a.status}
                      aria-label={`Status for ${a.company}`}
                      onChange={(e) => {
                        const status = e.target.value as ApplicationStatus;
                        void onSave({ ...a, status, submittedAt: a.submittedAt ?? (status !== "started" ? new Date().toISOString() : undefined) });
                      }}
                      className={`rounded-md border-0 px-2 py-1 text-xs font-medium ${toneOf(a.status)}`}
                    >
                      {STATUSES.map((s) => (
                        <option key={s.key} value={s.key}>
                          {s.label}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="py-2 text-right">
                    <button type="button" className="btn btn-xs btn-ghost" onClick={() => void onRemove(a.id)} aria-label={`Remove ${a.company}`}>
                      ✕
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Section>
  );
}

function Chip({ on, onClick, children }: { on: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full border px-2.5 py-1 text-xs transition-colors ${on ? "border-neutral-900 bg-neutral-900 text-white" : "border-line bg-paper hover:bg-wash"}`}
    >
      {children}
    </button>
  );
}

function AddForm({ onAdd }: { onAdd: (a: TrackedApplication) => Promise<void> }) {
  const [company, setCompany] = useState("");
  const [title, setTitle] = useState("");
  const [url, setUrl] = useState("");
  const [status, setStatus] = useState<ApplicationStatus>("submitted");
  function submit(e: FormEvent) {
    e.preventDefault();
    if (!company.trim()) return;
    const now = new Date().toISOString();
    void onAdd({
      id: `manual:${Date.now().toString(36)}`,
      url: url.trim(),
      company: company.trim(),
      title: title.trim(),
      site: "Manual",
      profileId: "",
      profileLabel: "",
      status,
      startedAt: now,
      submittedAt: status === "started" ? undefined : now,
      updatedAt: now,
    });
  }
  return (
    <form onSubmit={submit} className="mb-4 grid gap-2 rounded-lg border border-line bg-wash p-3 sm:grid-cols-[1fr_1fr_1.4fr_auto_auto]">
      <input className="field h-8 text-xs" placeholder="Company" value={company} onChange={(e) => setCompany(e.target.value)} autoFocus />
      <input className="field h-8 text-xs" placeholder="Role" value={title} onChange={(e) => setTitle(e.target.value)} />
      <input className="field h-8 text-xs" placeholder="Posting URL (optional)" value={url} onChange={(e) => setUrl(e.target.value)} />
      <select className="field h-8 text-xs" value={status} onChange={(e) => setStatus(e.target.value as ApplicationStatus)}>
        {STATUSES.map((s) => (
          <option key={s.key} value={s.key}>
            {s.label}
          </option>
        ))}
      </select>
      <button className="btn btn-sm btn-primary" type="submit">
        Add
      </button>
    </form>
  );
}

// --- Profiles ---------------------------------------------------------------------------

type Ext = ReturnType<typeof useExtension>;

function ProfileRow({ source, facts, onFacts, ext }: { source: ResumeSource; facts: ApplicantFacts; onFacts: (f: ApplicantFacts) => Promise<void>; ext: Ext }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  const [preview, setPreview] = useState<ReturnType<typeof fromResume> | null>(null);
  const profileId = `site-${source.id}`;
  const inExt = ext.profiles.find((p) => p.id === profileId);

  useEffect(() => {
    if (open && !preview) void source.load().then((r) => setPreview(fromResume(r)));
  }, [open, preview, source]);

  async function send() {
    setBusy(true);
    setMessage(null);
    try {
      const resume = await source.load();
      const profile = buildProfile(resume, facts, { id: profileId, resumeId: source.id === "local" ? undefined : source.id, resumeTitle: source.title });
      const { toDocx } = await import("../resume/exportDocx");
      const stem = (resume.name || "Resume").replace(/[^\w-]+/g, "_");
      profile.resumeFile = {
        name: `${stem}_Resume.docx`,
        type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        data: await toBase64(await toDocx(resume)),
        updated: new Date().toISOString(),
      };
      await ext.sendProfile(profile);
      const n = (k: number, one: string) => `${k} ${one}${k === 1 ? "" : "s"}`;
      setMessage({ tone: "ok", text: `Sent: ${n(profile.experience.length, "job")}, ${n(profile.education.length, "school")}, ${n(profile.skills.length, "skill")}, resume attached.` });
    } catch (err) {
      setMessage({ tone: "error", text: err instanceof Error ? err.message : String(err) });
    } finally {
      setBusy(false);
    }
  }

  return (
    <li className="px-3 py-2.5" data-testid="profile-row">
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" className="min-w-0 flex-1 cursor-pointer text-left" onClick={() => setOpen((v) => !v)}>
          <span className="block truncate text-sm font-medium">{facts.label || source.title}</span>
          <span className="block text-[11px] text-neutral-400">
            From “{source.title}”
            {inExt ? ` · in extension since ${day(inExt.origin?.syncedAt)}${inExt.resumeFile ? ` · attaches ${inExt.resumeFile.name}` : ""}` : " · not in the extension yet"}
          </span>
        </button>
        <button type="button" className="btn btn-sm" onClick={() => setOpen((v) => !v)}>
          {open ? "Close" : "Details"}
        </button>
        <button type="button" className="btn btn-sm btn-primary" disabled={busy || ext.status !== "ready"} onClick={() => void send()} title={ext.status !== "ready" ? "Install the extension first" : undefined}>
          {busy ? "Sending…" : inExt ? "Update extension" : "Send to extension"}
        </button>
      </div>
      {message ? <p className={`mt-2 text-xs ${message.tone === "ok" ? "text-emerald-700" : "text-red-700"}`}>{message.text}</p> : null}
      {open ? (
        <div className="mt-3 grid gap-4 md:grid-cols-2">
          <div className="space-y-1 text-xs">
            <p className="label">From the resume</p>
            {preview ? (
              <>
                <p>
                  {[preview.name.firstName, preview.name.middleName, preview.name.lastName].filter(Boolean).join(" ")} · {preview.contact.email ?? "no email"} ·{" "}
                  {preview.contact.phone ?? "no phone"}
                </p>
                {preview.experience.map((e, i) => (
                  <p key={i} className="text-neutral-600">
                    {e.title} · {e.company} <span className="text-neutral-400">({e.start || "?"} → {e.end ?? "present"})</span>
                  </p>
                ))}
                {preview.education.map((e, i) => (
                  <p key={i} className="text-neutral-600">
                    {e.degree}
                    {e.field ? `, ${e.field}` : ""} · {e.school} <span className="text-neutral-400">({e.level}, {e.end ?? "?"})</span>
                  </p>
                ))}
                <p className="text-neutral-500">Skills: {preview.skills.join(", ") || "none found"}</p>
              </>
            ) : (
              <p className="text-neutral-400">Reading…</p>
            )}
          </div>
          <FactsForm facts={facts} onChange={onFacts} />
        </div>
      ) : null}
    </li>
  );
}

const COUNTRIES = ["Canada", "United States", "United Kingdom", "Australia"];

function FactsForm({ facts, onChange }: { facts: ApplicantFacts; onChange: (f: ApplicantFacts) => Promise<void> }) {
  const [f, setF] = useState(facts);
  const [saved, setSaved] = useState(false);
  const set = (patch: Partial<ApplicantFacts>) => {
    setF((cur) => ({ ...cur, ...patch }));
    setSaved(false);
  };
  const toggle = (list: string[], c: string) => (list.includes(c) ? list.filter((x) => x !== c) : [...list, c]);
  const input = (label: string, value: string, change: (v: string) => void, placeholder?: string) => (
    <label className="block">
      <span className="label mb-0.5 block">{label}</span>
      <input className="field h-8 text-xs" value={value} placeholder={placeholder} onChange={(e) => change(e.target.value)} />
    </label>
  );
  return (
    <form
      className="space-y-2 text-xs"
      onSubmit={(e) => {
        e.preventDefault();
        void onChange(f).then(() => setSaved(true));
      }}
    >
      <p className="label">Not on a resume</p>
      <div className="grid grid-cols-2 gap-2">
        {input("Profile name", f.label, (label) => set({ label }))}
        {input("Preferred first name", f.preferredFirstName, (preferredFirstName) => set({ preferredFirstName }))}
        {input("Street address", f.address.line1, (line1) => set({ address: { ...f.address, line1 } }))}
        {input("City", f.address.city, (city) => set({ address: { ...f.address, city } }))}
        {input("Province / state", f.address.region, (region) => set({ address: { ...f.address, region } }), "British Columbia")}
        {input("Postal code", f.address.postalCode, (postalCode) => set({ address: { ...f.address, postalCode } }))}
        {input("Country", f.address.country, (country) => set({ address: { ...f.address, country }, homeCountry: country, phoneCountry: country }))}
        {input("Notice period", f.noticePeriod, (noticePeriod) => set({ noticePeriod }))}
        {input("Earliest start (YYYY-MM-DD)", f.earliestStart, (earliestStart) => set({ earliestStart }))}
        {input("Salary expectation", f.salaryExpectation, (salaryExpectation) => set({ salaryExpectation }))}
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-1">
        <span className="text-neutral-500">Allowed to work in:</span>
        {COUNTRIES.map((c) => (
          <label key={c} className="inline-flex items-center gap-1">
            <input type="checkbox" checked={f.authorized.includes(c)} onChange={() => set({ authorized: toggle(f.authorized, c) })} /> {c}
          </label>
        ))}
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-1">
        <span className="text-neutral-500">Need sponsorship in:</span>
        {COUNTRIES.map((c) => (
          <label key={c} className="inline-flex items-center gap-1">
            <input type="checkbox" checked={f.sponsorship.includes(c)} onChange={() => set({ sponsorship: toggle(f.sponsorship, c) })} /> {c}
          </label>
        ))}
      </div>
      <label className="inline-flex items-center gap-1">
        <input type="checkbox" checked={f.willingToRelocate} onChange={(e) => set({ willingToRelocate: e.target.checked })} /> Willing to relocate
      </label>
      {input("“How did you hear about us?” (first one offered wins)", f.sources, (sources) => set({ sources }))}
      <details>
        <summary className="cursor-pointer text-neutral-500">Voluntary self-identification (default: decline)</summary>
        <div className="mt-2 grid grid-cols-2 gap-2">
          {(
            [
              ["gender", ["decline", "male", "female", "nonbinary"]],
              ["hispanicLatino", ["decline", "yes", "no"]],
              ["veteran", ["decline", "not", "protected"]],
              ["disability", ["decline", "yes", "no"]],
            ] as const
          ).map(([k, opts]) => (
            <label key={k} className="block">
              <span className="label mb-0.5 block">{k}</span>
              <select className="field h-8 text-xs" value={f.eeo[k]} onChange={(e) => set({ eeo: { ...f.eeo, [k]: e.target.value } as ApplicantFacts["eeo"] })}>
                {opts.map((o) => (
                  <option key={o}>{o}</option>
                ))}
              </select>
            </label>
          ))}
          {input("race", f.eeo.race, (race) => set({ eeo: { ...f.eeo, race } }), "decline")}
        </div>
      </details>
      <div className="flex items-center gap-2">
        <button className="btn btn-sm" type="submit">
          Save details
        </button>
        {saved ? <span className="text-emerald-700">Saved. Send to the extension to use them.</span> : null}
      </div>
    </form>
  );
}

function HowItWorks({ missing }: { missing: boolean }) {
  return (
    <details className="border border-line bg-paper p-5 shadow-soft" open={missing}>
      <summary className="cursor-pointer text-[15px] font-semibold">How it works{missing ? ": install the extension" : ""}</summary>
      <ol className="mt-3 list-decimal space-y-1.5 pl-5 text-xs leading-relaxed text-neutral-600">
        <li>
          Build the extension (<code>cd extension && npm install && npm run build</code>), then in Chrome open <code>chrome://extensions</code>, turn on Developer
          mode, <b>Load unpacked</b> → <code>extension/dist</code>. Reload this page: the badge turns green.
        </li>
        <li>Pick a resume above, fill in what a resume can't say (address, work authorization), and <b>Send to extension</b>.</li>
        <li>
          Open an application. Workday, Greenhouse, Ashby and Lever show an <b>iudicium · Fill</b> button; on any other site click the toolbar icon.
        </li>
        <li>Fill, review what's yellow (needs you) or blue (suggestions), and submit yourself. It never submits for you.</li>
        <li>The application lands in the tracker above; Submit marks it Applied. Update the status as you hear back.</li>
      </ol>
    </details>
  );
}

export default function ApplicationsPage() {
  return (
    <AuthProvider>
      <ApplicationsInner />
    </AuthProvider>
  );
}
