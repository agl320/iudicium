import { useCallback, useState } from "react";
import {
  type Entry,
  type Point,
  type Resume,
  type Section,
  type Style,
  newEntry,
  newPoint,
  newSection,
  sampleResume,
} from "./types";

// --- Browser storage (signed out) ---------------------------------------------

const STORAGE_KEY = "iudicium.resume.v1";

export const localResume = {
  load(): Resume | null {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? (JSON.parse(raw) as Resume) : null;
    } catch {
      return null;
    }
  },
  save(resume: Resume): void {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(resume));
    } catch {
      // Storage full or disabled: keep working in memory.
    }
  },
  clear(): void {
    localStorage.removeItem(STORAGE_KEY);
  },
};

export function loadLocalOrSample(): Resume {
  return localResume.load() ?? sampleResume();
}

// --- Pure helpers -----------------------------------------------------------

function move<T>(items: T[], from: number, to: number): T[] {
  if (from === to || from < 0 || to < 0) return items;
  const next = items.slice();
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
}

function mapSection(r: Resume, sectionId: string, fn: (s: Section) => Section): Resume {
  return { ...r, sections: r.sections.map((s) => (s.id === sectionId ? fn(s) : s)) };
}

function mapEntry(
  r: Resume,
  sectionId: string,
  entryId: string,
  fn: (e: Entry) => Entry,
): Resume {
  return mapSection(r, sectionId, (s) => ({
    ...s,
    entries: s.entries.map((e) => (e.id === entryId ? fn(e) : e)),
  }));
}

function mapPoints(
  r: Resume,
  sectionId: string,
  entryId: string,
  fn: (points: Point[]) => Point[],
): Resume {
  return mapEntry(r, sectionId, entryId, (e) => ({ ...e, points: fn(e.points) }));
}

// --- Hook ---------------------------------------------------------------------

const HISTORY_LIMIT = 100;

type History = {
  past: Resume[];
  present: Resume;
  future: Resume[];
  // Consecutive edits with the same key (typing in one field, dragging one
  // slider) within MERGE_MS become a single undo step.
  lastKey: string | null;
  lastAt: number;
};

const MERGE_MS = 1000;

/** Editing state with undo/redo. Saving is up to the caller (browser or
 *  account), which watches `resume`. */
export function useResumeStore(initial: Resume) {
  const [history, setHistory] = useState<History>(() => ({
    past: [],
    present: initial,
    future: [],
    lastKey: null,
    lastAt: 0,
  }));
  const resume = history.present;

  const commit = useCallback((fn: (r: Resume) => Resume, mergeKey: string | null = null) => {
    const now = Date.now();
    setHistory((h) => {
      const next = fn(h.present);
      if (next === h.present) return h;
      const merge = mergeKey !== null && mergeKey === h.lastKey && now - h.lastAt < MERGE_MS;
      return {
        past: merge ? h.past : [...h.past.slice(-HISTORY_LIMIT + 1), h.present],
        present: next,
        future: [],
        lastKey: mergeKey,
        lastAt: now,
      };
    });
  }, []);

  const undo = useCallback(() => {
    setHistory((h) => {
      const previous = h.past.at(-1);
      if (!previous) return h;
      return {
        past: h.past.slice(0, -1),
        present: previous,
        future: [h.present, ...h.future],
        lastKey: null,
        lastAt: 0,
      };
    });
  }, []);

  const redo = useCallback(() => {
    setHistory((h) => {
      const [next, ...rest] = h.future;
      if (!next) return h;
      return { past: [...h.past, h.present], present: next, future: rest, lastKey: null, lastAt: 0 };
    });
  }, []);

  const actions = {
    replace: (next: Resume) => commit(() => next),
    setName: (name: string) => commit((r) => ({ ...r, name }), "name"),
    setContact: (contact: string[]) => commit((r) => ({ ...r, contact }), "contact"),
    setStyle: (patch: Partial<Style>) =>
      commit((r) => ({ ...r, style: { ...r.style, ...patch } }), `style:${Object.keys(patch).join()}`),

    addSection: (title?: string) => {
      const section = newSection(title, [newEntry({ points: [newPoint()] })]);
      commit((r) => ({ ...r, sections: [...r.sections, section] }));
      return section.id;
    },
    updateSection: (sectionId: string, patch: Partial<Omit<Section, "id" | "entries">>) =>
      commit((r) => mapSection(r, sectionId, (s) => ({ ...s, ...patch })), `section:${sectionId}`),
    removeSection: (sectionId: string) =>
      commit((r) => ({ ...r, sections: r.sections.filter((s) => s.id !== sectionId) })),
    moveSection: (activeId: string, overId: string) =>
      commit((r) => {
        const ids = r.sections.map((s) => s.id);
        return { ...r, sections: move(r.sections, ids.indexOf(activeId), ids.indexOf(overId)) };
      }),

    addEntry: (sectionId: string, plain = false) => {
      const entry = newEntry({ plain, points: [newPoint()] });
      commit((r) => mapSection(r, sectionId, (s) => ({ ...s, entries: [...s.entries, entry] })));
      return entry.id;
    },
    updateEntry: (sectionId: string, entryId: string, patch: Partial<Omit<Entry, "id" | "points">>) =>
      commit(
        (r) => mapEntry(r, sectionId, entryId, (e) => ({ ...e, ...patch })),
        `entry:${entryId}:${Object.keys(patch).join()}`,
      ),
    removeEntry: (sectionId: string, entryId: string) =>
      commit((r) =>
        mapSection(r, sectionId, (s) => ({
          ...s,
          entries: s.entries.filter((e) => e.id !== entryId),
        })),
      ),
    // Entries only reorder inside their own section.
    moveEntry: (sectionId: string, activeId: string, overId: string) =>
      commit((r) =>
        mapSection(r, sectionId, (s) => {
          const ids = s.entries.map((e) => e.id);
          return { ...s, entries: move(s.entries, ids.indexOf(activeId), ids.indexOf(overId)) };
        }),
      ),

    addPoint: (sectionId: string, entryId: string, active = true, text = "") => {
      const point = newPoint(text, active);
      commit((r) => mapPoints(r, sectionId, entryId, (points) => [...points, point]));
      return point.id;
    },
    updatePoint: (sectionId: string, entryId: string, pointId: string, text: string) =>
      commit(
        (r) =>
          mapPoints(r, sectionId, entryId, (points) =>
            points.map((p) => (p.id === pointId ? { ...p, text } : p)),
          ),
        `point:${pointId}`,
      ),
    removePoint: (sectionId: string, entryId: string, pointId: string) =>
      commit((r) =>
        mapPoints(r, sectionId, entryId, (points) => points.filter((p) => p.id !== pointId)),
      ),
    // Points only reorder inside their own entry.
    movePoint: (sectionId: string, entryId: string, activeId: string, overId: string) =>
      commit((r) =>
        mapPoints(r, sectionId, entryId, (points) => {
          const ids = points.map((p) => p.id);
          return move(points, ids.indexOf(activeId), ids.indexOf(overId));
        }),
      ),
    // Move a point between the page and the entry's pool.
    setPointActive: (sectionId: string, entryId: string, pointId: string, active: boolean) =>
      commit((r) =>
        mapPoints(r, sectionId, entryId, (points) => {
          const updated = points.map((p) => (p.id === pointId ? { ...p, active } : p));
          if (!active) return updated;
          // Newly used points go after the last active point.
          const from = updated.findIndex((p) => p.id === pointId);
          const lastActive = updated.reduce((last, p, i) => (p.active && i !== from ? i : last), -1);
          return move(updated, from, from > lastActive ? lastActive + 1 : from);
        }),
      ),
    // Put a pool point in place of an active one (same position).
    swapPoints: (sectionId: string, entryId: string, activeId: string, poolId: string) =>
      commit((r) =>
        mapPoints(r, sectionId, entryId, (points) => {
          const a = points.findIndex((p) => p.id === activeId);
          const b = points.findIndex((p) => p.id === poolId);
          if (a < 0 || b < 0 || !points[a].active || points[b].active) return points;
          const next = points.slice();
          next[a] = { ...points[b], active: true };
          next[b] = { ...points[a], active: false };
          return next;
        }),
      ),
  };

  return {
    resume,
    actions,
    undo,
    redo,
    canUndo: history.past.length > 0,
    canRedo: history.future.length > 0,
  };
}

export type ResumeActions = ReturnType<typeof useResumeStore>["actions"];
