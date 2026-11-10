import { AuthProvider } from "../auth/AuthProvider";
import type { User } from "@supabase/supabase-js";
import { useCallback, useEffect, useRef, useState } from "react";
import { AccountMenu } from "../account/AccountMenu";
import { useAuth } from "../auth/context";
import {
  type CloudResume,
  ConflictError,
  createResume,
  getResume,
  listResumes,
  type ResumeMeta,
  saveResume,
} from "./cloud";
import { Editor } from "./Editor";
import { ResumeSwitcher } from "./ResumeSwitcher";
import { loadLocalOrSample, localResume } from "./store";
import { type Resume, sampleResume } from "./types";
import { Button } from "./ui";

function FullScreenMessage({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-screen flex-col items-center justify-center gap-3 bg-neutral-50 px-6 text-center">
      {children}
    </div>
  );
}

function ResumeBuilderInner() {
  const { user, loading } = useAuth();
  if (loading) {
    return (
      <FullScreenMessage>
        <p className="font-mono text-xs uppercase tracking-widest text-neutral-400">Loading…</p>
      </FullScreenMessage>
    );
  }
  // Remount on sign-in/out so each mode starts from its own data.
  return user ? <CloudWorkspace key={user.id} user={user} /> : <LocalWorkspace />;
}

// --- Signed out: this browser only -------------------------------------------

function LocalWorkspace() {
  const [initial] = useState(loadLocalOrSample);
  const timer = useRef<number | undefined>(undefined);
  const latest = useRef<Resume | null>(null);
  const onChange = useCallback((resume: Resume) => {
    latest.current = resume;
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => {
      localResume.save(resume);
      latest.current = null;
    }, 300);
  }, []);

  // Write the last edit right away if the tab closes or the view changes.
  useEffect(() => {
    const save = () => {
      window.clearTimeout(timer.current);
      if (latest.current) localResume.save(latest.current);
      latest.current = null;
    };
    window.addEventListener("pagehide", save);
    return () => {
      window.removeEventListener("pagehide", save);
      save();
    };
  }, []);

  return (
    <Editor
      initial={initial}
      onChange={onChange}
      storageNote="Saved in this browser only — sign in to keep resumes in an account."
      account={
        <a
          href="#/login"
          className="inline-flex h-8 items-center rounded-lg border border-neutral-200 px-3 text-xs font-medium text-neutral-700 transition-colors hover:bg-neutral-100"
        >
          Sign in
        </a>
      }
    />
  );
}

// --- Signed in: resumes in the account ------------------------------------------

export type SaveStatus = "saved" | "saving" | "unsaved" | "error" | "conflict";

const CURRENT_KEY = (userId: string) => `iudicium.resume.current.${userId}`;

function CloudWorkspace({ user }: { user: User }) {
  const [list, setList] = useState<ResumeMeta[]>([]);
  const [current, setCurrent] = useState<CloudResume | null>(null);
  const [status, setStatus] = useState<SaveStatus>("saved");
  const [error, setError] = useState("");
  const [reloadKey, setReloadKey] = useState(0);

  // The open resume and the server version this copy is based on. Saves and
  // loads that finish after another resume was opened are ignored.
  const doc = useRef<{ id: string; version: number } | null>(null);
  const pending = useRef<Resume | null>(null);
  const inFlight = useRef<Promise<void> | null>(null);
  const timer = useRef<number | undefined>(undefined);
  const statusRef = useRef<SaveStatus>("saved");
  const alive = useRef(true);
  const retry = useRef<() => Promise<void>>(async () => {});
  const [notice, setNotice] = useState("");

  const updateStatus = useCallback((next: SaveStatus) => {
    statusRef.current = next;
    if (alive.current) setStatus(next);
  }, []);

  useEffect(() => {
    alive.current = true;
    return () => {
      // Leaving (sign out, another page): stop timers and retries.
      alive.current = false;
      window.clearTimeout(timer.current);
    };
  }, []);

  useEffect(() => {
    if (!notice) return;
    const t = window.setTimeout(() => setNotice(""), 5000);
    return () => window.clearTimeout(t);
  }, [notice]);

  const refreshList = useCallback(async () => {
    const resumes = await listResumes();
    if (alive.current) setList(resumes);
  }, []);

  const flush = useCallback(async (): Promise<void> => {
    window.clearTimeout(timer.current);
    if (inFlight.current) await inFlight.current;
    const resume = pending.current;
    const target = doc.current;
    // Nothing to save, or a conflict the user has to resolve first.
    if (!resume || !target || statusRef.current === "conflict") return;
    pending.current = null;
    updateStatus("saving");
    const run = (async () => {
      try {
        const nextVersion = await saveResume(target.id, resume, target.version);
        if (doc.current !== target) return; // another resume was opened meanwhile
        target.version = nextVersion;
        updateStatus(pending.current ? "unsaved" : "saved");
        if (pending.current && alive.current) {
          timer.current = window.setTimeout(() => void retry.current(), 800);
        }
      } catch (err) {
        if (doc.current !== target) return;
        // Keep the newest edits (typed while this save was in flight).
        pending.current = pending.current ?? resume;
        if (err instanceof ConflictError) {
          updateStatus("conflict");
        } else {
          updateStatus("error");
          if (alive.current) {
            timer.current = window.setTimeout(() => void retry.current(), 5000);
          }
        }
      }
    })();
    inFlight.current = run;
    await run;
    inFlight.current = null;
  }, [updateStatus]);

  useEffect(() => {
    retry.current = flush;
  }, [flush]);

  const open = useCallback(
    async (id: string) => {
      window.clearTimeout(timer.current);
      if (inFlight.current) await inFlight.current;
      const resume = await getResume(id);
      doc.current = { id, version: resume.version };
      pending.current = null;
      updateStatus("saved");
      if (!alive.current) return;
      setCurrent(resume);
      setReloadKey((n) => n + 1);
      localStorage.setItem(CURRENT_KEY(user.id), id);
    },
    [user.id, updateStatus],
  );

  // First load: open the last resume, or create one (from this browser's
  // resume if there is one, so nothing made before signing in is lost).
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        let resumes = await listResumes();
        if (resumes.length === 0) {
          const local = localResume.load();
          const seed = local ?? sampleResume();
          await createResume(local ? seed.name || "My resume" : "My resume", seed);
          if (local) localResume.clear();
          resumes = await listResumes();
        }
        if (cancelled) return;
        setList(resumes);
        const remembered = localStorage.getItem(CURRENT_KEY(user.id));
        const target = resumes.find((r) => r.id === remembered) ?? resumes[0];
        await open(target.id);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, user.id]);

  const onChange = useCallback(
    (resume: Resume) => {
      pending.current = resume;
      // During a conflict, hold edits until the user picks a version.
      if (statusRef.current === "conflict") return;
      updateStatus("unsaved");
      window.clearTimeout(timer.current);
      timer.current = window.setTimeout(() => void flush(), 800);
    },
    [flush, updateStatus],
  );

  // Warn before leaving with unsaved edits.
  useEffect(() => {
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      if (pending.current || statusRef.current === "saving") event.preventDefault();
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, []);

  /** Saves pending edits now; false if they could not be saved. */
  const saveNow = useCallback(async (): Promise<boolean> => {
    await flush();
    return !pending.current;
  }, [flush]);

  async function switchTo(id: string) {
    try {
      if (!(await saveNow())) {
        const reason = statusRef.current === "conflict" ? "it conflicts with another tab" : "saving failed";
        if (!confirm(`This resume has unsaved changes (${reason}). Switch anyway and discard them?`)) return;
      }
      await open(id);
      await refreshList();
    } catch (err) {
      setNotice(err instanceof Error ? err.message : String(err));
    }
  }

  async function loadLatest() {
    if (!doc.current) return;
    try {
      await open(doc.current.id);
    } catch (err) {
      setNotice(err instanceof Error ? err.message : String(err));
    }
  }

  async function keepMine() {
    const target = doc.current;
    if (!target) return;
    try {
      const latest = await getResume(target.id);
      if (doc.current !== target) return;
      target.version = latest.version;
      updateStatus("unsaved");
      await flush();
    } catch (err) {
      setNotice(err instanceof Error ? err.message : String(err));
    }
  }

  if (error) {
    return (
      <FullScreenMessage>
        <p className="text-sm font-medium text-neutral-800">Could not load your resumes</p>
        <p className="max-w-md text-xs text-neutral-500">{error}</p>
        <Button onClick={() => window.location.reload()}>Try again</Button>
      </FullScreenMessage>
    );
  }
  if (!current) {
    return (
      <FullScreenMessage>
        <p className="font-mono text-xs uppercase tracking-widest text-neutral-400">Loading your resumes…</p>
      </FullScreenMessage>
    );
  }

  return (
    <>
      <Editor
        key={`${current.id}:${reloadKey}`}
        initial={current.data}
        onChange={onChange}
        storageNote="Saved to your account automatically."
        toolbar={
          <ResumeSwitcher
            list={list}
            current={current}
            status={status}
            onOpen={(id) => void switchTo(id)}
            saveCurrent={saveNow}
            onListChanged={async (openId) => {
              await refreshList();
              if (openId) await switchTo(openId);
            }}
            onRenamed={(title) => setCurrent((c) => (c ? { ...c, title } : c))}
          />
        }
        account={<AccountMenu user={user} beforeSignOut={saveNow} />}
      />
      {status === "conflict" ? (
        <div className="rb-screen rb-toast fixed bottom-5 left-1/2 z-40 flex -translate-x-1/2 items-center gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-2.5 text-sm text-amber-900 shadow-soft border border-line">
          <span>This resume was changed in another tab or device.</span>
          <Button size="xs" onClick={() => void loadLatest()}>
            Load latest
          </Button>
          <Button size="xs" variant="primary" onClick={() => void keepMine()}>
            Keep mine
          </Button>
        </div>
      ) : null}
      {notice ? (
        <div className="rb-screen rb-toast fixed bottom-5 left-1/2 z-40 -translate-x-1/2 rounded-lg border border-red-200 bg-red-50 px-4 py-2.5 text-sm text-red-700 shadow-soft border border-line">
          {notice}
        </div>
      ) : null}
    </>
  );
}

// Accounts are only loaded on these pages, not on the job board.
export default function ResumeBuilder() {
  return (
    <AuthProvider>
      <ResumeBuilderInner />
    </AuthProvider>
  );
}
