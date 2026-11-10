import { useRef, useState } from "react";
import { type CloudResume, createResume, deleteResume, duplicateResume, renameResume, type ResumeMeta } from "./cloud";
import { Popover } from "./Popover";
import type { SaveStatus } from "./ResumeBuilder";
import { sampleResume } from "./types";

const STATUS: Record<SaveStatus, { label: string; dot: string }> = {
  saved: { label: "Saved", dot: "bg-emerald-500" },
  saving: { label: "Saving…", dot: "bg-amber-400 animate-pulse" },
  unsaved: { label: "Unsaved", dot: "bg-neutral-300" },
  error: { label: "Not saved — retrying", dot: "bg-red-500" },
  conflict: { label: "Conflict", dot: "bg-amber-500" },
};

function timeAgo(iso: string): string {
  const seconds = (Date.now() - new Date(iso).getTime()) / 1000;
  if (seconds < 60) return "just now";
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return new Date(iso).toLocaleDateString();
}

type Props = {
  list: ResumeMeta[];
  current: CloudResume;
  status: SaveStatus;
  onOpen: (id: string) => void;
  // After create/duplicate/delete; `openId` = resume to switch to.
  onListChanged: (openId?: string) => Promise<void>;
  onRenamed: (title: string) => void;
  // Saves pending edits of the open resume (before duplicating it).
  saveCurrent: () => Promise<boolean>;
};

export function ResumeSwitcher({ list, current, status, onOpen, onListChanged, onRenamed, saveCurrent }: Props) {
  const [renaming, setRenaming] = useState<string | null>(null);
  const cancelRename = useRef(false);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const title = list.find((r) => r.id === current.id)?.title ?? current.title;

  async function run(task: () => Promise<void>) {
    setBusy(true);
    setError("");
    try {
      await task();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  async function commitRename(id: string) {
    const next = draft.trim();
    setRenaming(null);
    if (!next || next === list.find((r) => r.id === id)?.title) return;
    await run(async () => {
      await renameResume(id, next);
      if (id === current.id) onRenamed(next);
      await onListChanged();
    });
  }

  return (
    <div className="ml-2 flex items-center gap-3">
      <Popover
        width="w-80"
        trigger={(open) => (
          <button
            type="button"
            className={`inline-flex h-8 max-w-56 cursor-pointer items-center gap-1.5 rounded-lg border px-2.5 text-xs font-medium transition-colors ${
              open ? "border-neutral-300 bg-neutral-100" : "border-neutral-200 hover:bg-neutral-100"
            }`}
          >
            <span className="truncate">{title}</span>
            <span className={`text-neutral-400 transition-transform ${open ? "rotate-180" : ""}`}>▾</span>
          </button>
        )}
      >
        {(close) => (
          <div>
            <p className="px-2.5 pb-1 pt-1.5 font-mono text-[10px] uppercase tracking-widest text-neutral-400">
              Your resumes · {list.length}
            </p>
            <ul className="max-h-72 overflow-y-auto">
              {list.map((item) => (
                <li
                  key={item.id}
                  className={`group flex items-center gap-1 rounded-lg px-2.5 py-1.5 transition-colors ${
                    item.id === current.id ? "bg-neutral-100" : "hover:bg-neutral-50"
                  }`}
                >
                  {renaming === item.id ? (
                    <input
                      autoFocus
                      className="h-7 flex-1 rounded-lg border border-neutral-300 px-2 text-xs outline-none focus:ring-2 focus:ring-neutral-300"
                      value={draft}
                      onChange={(event) => setDraft(event.target.value)}
                      onBlur={() => {
                        if (cancelRename.current) {
                          cancelRename.current = false;
                          setRenaming(null);
                          return;
                        }
                        void commitRename(item.id);
                      }}
                      onKeyDown={(event) => {
                        if (event.key === "Enter") (event.target as HTMLInputElement).blur();
                        if (event.key === "Escape") {
                          event.preventDefault();
                          cancelRename.current = true;
                          (event.target as HTMLInputElement).blur();
                        }
                        event.stopPropagation();
                      }}
                    />
                  ) : (
                    <button
                      type="button"
                      className="min-w-0 flex-1 cursor-pointer text-left"
                      onClick={() => {
                        close();
                        if (item.id !== current.id) onOpen(item.id);
                      }}
                    >
                      <span className="block truncate text-sm text-neutral-800">{item.title}</span>
                      <span className="block text-[11px] text-neutral-400">Edited {timeAgo(item.updated_at)}</span>
                    </button>
                  )}
                  <div className="flex shrink-0 items-center">
                    <IconButton
                      label="Rename"
                      onClick={() => {
                        setDraft(item.title);
                        setRenaming(item.id);
                      }}
                    >
                      ✎
                    </IconButton>
                    <IconButton
                      label="Duplicate"
                      onClick={() =>
                        void run(async () => {
                          if (item.id === current.id) await saveCurrent();
                          const copy = await duplicateResume(item.id);
                          close();
                          await onListChanged(copy.id);
                        })
                      }
                    >
                      ⧉
                    </IconButton>
                    <IconButton
                      label="Delete"
                      danger
                      disabled={list.length <= 1}
                      onClick={() => {
                        if (!confirm(`Delete “${item.title}”? This cannot be undone.`)) return;
                        void run(async () => {
                          await deleteResume(item.id);
                          const next = list.find((r) => r.id !== item.id);
                          await onListChanged(item.id === current.id ? next?.id : undefined);
                        });
                      }}
                    >
                      ✕
                    </IconButton>
                  </div>
                </li>
              ))}
            </ul>
            {error ? <p className="px-2.5 py-1 text-xs text-red-600">{error}</p> : null}
            <div className="mt-1 border-t border-neutral-100 pt-1">
              <button
                type="button"
                disabled={busy}
                className="w-full cursor-pointer rounded-lg px-2.5 py-1.5 text-left text-sm text-neutral-700 transition-colors hover:bg-neutral-50 disabled:opacity-50"
                onClick={() =>
                  void run(async () => {
                    const created = await createResume("Untitled resume", sampleResume());
                    close();
                    await onListChanged(created.id);
                  })
                }
              >
                + New resume
              </button>
              <a
                href="#/account"
                className="block rounded-lg px-2.5 py-1.5 text-sm text-neutral-500 transition-colors hover:bg-neutral-50 hover:text-neutral-800"
              >
                Manage in account settings
              </a>
            </div>
          </div>
        )}
      </Popover>
      <span className="inline-flex items-center gap-1.5 text-[11px] text-neutral-400" title="Changes save automatically">
        <span className={`size-1.5 rounded-lg ${STATUS[status].dot}`} />
        {STATUS[status].label}
      </span>
    </div>
  );
}

function IconButton({
  label,
  onClick,
  children,
  danger,
  disabled,
}: {
  label: string;
  onClick: () => void;
  children: React.ReactNode;
  danger?: boolean;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      disabled={disabled}
      onClick={(event) => {
        event.stopPropagation();
        onClick();
      }}
      className={`size-6 cursor-pointer rounded-lg text-xs transition-colors disabled:pointer-events-none disabled:opacity-30 ${
        danger ? "text-neutral-400 hover:bg-red-50 hover:text-red-600" : "text-neutral-400 hover:bg-neutral-200 hover:text-neutral-800"
      }`}
    >
      {children}
    </button>
  );
}
