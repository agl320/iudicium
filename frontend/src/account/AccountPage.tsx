import { AuthProvider } from "../auth/AuthProvider";
import { navigate } from "../hooks/useHashRoute";
import { type FormEvent, useCallback, useEffect, useState } from "react";
import { useAuth } from "../auth/context";
import {
  createResume,
  deleteAccount,
  deleteResume,
  duplicateResume,
  listResumes,
  renameResume,
  type ResumeMeta,
  signOut,
  updatePassword,
} from "../resume/cloud";
import { sampleResume } from "../resume/types";
import { Card, Field, Message, Shell, SubmitButton } from "./Shell";

const MIN_PASSWORD = 8;

function AccountPageInner() {
  const { user, loading, recovering, finishRecovery } = useAuth();

  useEffect(() => {
    // Only while still on this page (e.g. not after "Delete account" -> home).
    if (!loading && !user && window.location.hash.startsWith("#/account")) navigate("#/login");
  }, [loading, user]);

  if (!user) {
    return (
      <Shell>
        <p className="text-center font-mono text-xs uppercase tracking-widest text-neutral-400">Loading…</p>
      </Shell>
    );
  }

  return (
    <Shell wide>
      <div className="mb-6 flex items-center gap-3">
        <div className="flex size-10 items-center justify-center rounded-lg bg-neutral-900 text-sm font-semibold text-white">
          {(user.email ?? "?").charAt(0).toUpperCase()}
        </div>
        <div>
          <h1 className="text-lg font-semibold tracking-tight">Account</h1>
          <p className="text-xs text-neutral-500">
            {user.email} · member since {new Date(user.created_at).toLocaleDateString()}
          </p>
        </div>
      </div>
      <div className="space-y-4">
        {recovering ? (
          <Message tone="info">You followed a password reset link. Choose a new password below.</Message>
        ) : null}
        <PasswordCard highlight={recovering} onDone={finishRecovery} />
        <ResumesCard userId={user.id} />
        <SessionsCard />
        <DeleteCard email={user.email ?? ""} />
      </div>
    </Shell>
  );
}

function PasswordCard({ highlight, onDone }: { highlight: boolean; onDone: () => void }) {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: "error" | "success"; text: string } | null>(null);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (password.length < MIN_PASSWORD) {
      return setMessage({ tone: "error", text: `Use at least ${MIN_PASSWORD} characters.` });
    }
    if (password !== confirm) return setMessage({ tone: "error", text: "The passwords don't match." });
    setBusy(true);
    try {
      await updatePassword(password);
      setPassword("");
      setConfirm("");
      setMessage({ tone: "success", text: "Password updated." });
      onDone();
    } catch (err) {
      setMessage({ tone: "error", text: err instanceof Error ? err.message : String(err) });
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className={highlight ? "rounded-lg ring-2 ring-neutral-900/80" : ""}>
      <Card title="Password" description="Also works if you signed up with an email link and want a password.">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="New password" type="password" value={password} onChange={setPassword} autoComplete="new-password" autoFocus={highlight} />
          <Field label="Confirm" type="password" value={confirm} onChange={setConfirm} autoComplete="new-password" />
        </div>
        {message ? <Message tone={message.tone}>{message.text}</Message> : null}
        <div className="w-40">
          <SubmitButton busy={busy}>Update password</SubmitButton>
        </div>
      </Card>
    </form>
  );
}

function ResumesCard({ userId }: { userId: string }) {
  const [list, setList] = useState<ResumeMeta[] | null>(null);
  const [error, setError] = useState("");
  const [renaming, setRenaming] = useState<string | null>(null);
  const [draft, setDraft] = useState("");

  const refresh = useCallback(async () => {
    try {
      setList(await listResumes());
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    listResumes()
      .then((resumes) => !cancelled && setList(resumes))
      .catch((err: unknown) => !cancelled && setError(err instanceof Error ? err.message : String(err)));
    return () => {
      cancelled = true;
    };
  }, []);

  async function run(task: () => Promise<unknown>) {
    try {
      await task();
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  function open(id: string) {
    // The editor opens the last-used resume for this account.
    localStorage.setItem(`iudicium.resume.current.${userId}`, id);
    navigate("#/resume");
  }

  return (
    <Card title="Resumes" description="Each resume keeps its own point pools. Up to 25 per account.">
      {error ? <Message tone="error">{error}</Message> : null}
      {list === null ? (
        <p className="text-xs text-neutral-400">Loading…</p>
      ) : (
        <ul className="divide-y divide-neutral-100 rounded-lg border border-neutral-200">
          {list.map((item) => (
            <li key={item.id} className="group flex items-center gap-2 px-3 py-2 transition-colors hover:bg-neutral-50">
              {renaming === item.id ? (
                <input
                  autoFocus
                  value={draft}
                  onChange={(event) => setDraft(event.target.value)}
                  onBlur={() => {
                    setRenaming(null);
                    if (draft.trim() && draft.trim() !== item.title) void run(() => renameResume(item.id, draft.trim()));
                  }}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") (event.target as HTMLInputElement).blur();
                    if (event.key === "Escape") setRenaming(null);
                  }}
                  className="h-7 flex-1 rounded-lg border border-neutral-300 px-2 text-sm outline-none focus:ring-2 focus:ring-neutral-300"
                />
              ) : (
                <button type="button" className="min-w-0 flex-1 cursor-pointer text-left" onClick={() => open(item.id)}>
                  <span className="block truncate text-sm text-neutral-800">{item.title}</span>
                  <span className="block text-[11px] text-neutral-400">
                    Edited {new Date(item.updated_at).toLocaleString()}
                  </span>
                </button>
              )}
              <div className="flex shrink-0 gap-1 text-xs">
                <button type="button" className="cursor-pointer rounded-lg px-2 py-1 hover:bg-neutral-200" onClick={() => open(item.id)}>
                  Open
                </button>
                <button
                  type="button"
                  className="cursor-pointer rounded-lg px-2 py-1 hover:bg-neutral-200"
                  onClick={() => {
                    setDraft(item.title);
                    setRenaming(item.id);
                  }}
                >
                  Rename
                </button>
                <button type="button" className="cursor-pointer rounded-lg px-2 py-1 hover:bg-neutral-200" onClick={() => void run(() => duplicateResume(item.id))}>
                  Duplicate
                </button>
                <button
                  type="button"
                  disabled={list.length <= 1}
                  className="cursor-pointer rounded-lg px-2 py-1 text-red-600 hover:bg-red-50 disabled:opacity-30"
                  onClick={() => {
                    if (confirm(`Delete “${item.title}”? This cannot be undone.`)) void run(() => deleteResume(item.id));
                  }}
                >
                  Delete
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
      <button
        type="button"
        className="cursor-pointer text-xs font-medium text-neutral-600 hover:text-neutral-900"
        onClick={() => void run(() => createResume("Untitled resume", sampleResume()))}
      >
        + New resume
      </button>
    </Card>
  );
}

function SessionsCard() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function run(everywhere: boolean) {
    setBusy(true);
    setError("");
    try {
      await signOut(everywhere);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }
  return (
    <Card title="Sessions" description="Signing out everywhere also ends sessions on other browsers and devices.">
      {error ? <Message tone="error">{error}</Message> : null}
      <div className="flex gap-2">
        <button
          type="button"
          className="h-8 cursor-pointer rounded-lg border border-neutral-200 bg-white px-3.5 text-xs font-medium text-neutral-700 hover:bg-neutral-100"
          onClick={() => void run(false)}
        >
          Sign out
        </button>
        <button
          type="button"
          disabled={busy}
          className="h-8 cursor-pointer rounded-lg border border-neutral-200 bg-white px-3.5 text-xs font-medium text-neutral-700 hover:bg-neutral-100 disabled:opacity-50"
          onClick={() => void run(true)}
        >
          Sign out everywhere
        </button>
      </div>
    </Card>
  );
}

function DeleteCard({ email }: { email: string }) {
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (typed.trim().toLowerCase() !== email.toLowerCase()) {
      return setError("Type your email address exactly to confirm.");
    }
    setBusy(true);
    try {
      await deleteAccount();
      navigate("#/");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit}>
      <Card title="Delete account" description="Permanently deletes your account and every resume in it. This cannot be undone.">
        <Field label={`Type ${email} to confirm`} value={typed} onChange={setTyped} autoComplete="off" />
        {error ? <Message tone="error">{error}</Message> : null}
        <div className="w-44">
          <SubmitButton busy={busy} variant="danger">
            Delete my account
          </SubmitButton>
        </div>
      </Card>
    </form>
  );
}

// Accounts are only loaded on these pages, not on the job board.
export default function AccountPage() {
  return (
    <AuthProvider>
      <AccountPageInner />
    </AuthProvider>
  );
}
