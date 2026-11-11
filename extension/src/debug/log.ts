// Debug logging. Every entry goes into a ring buffer (so "Copy debug log"
// works after something went wrong, without re-running); entries are printed
// to the console when debug is on, warnings and errors always.
//
// Turn on: the panel's "Debug logging" checkbox, or in the page's DevTools
// console: localStorage.setItem("iudicium.debug", "1")

export type Level = "debug" | "info" | "warn" | "error";

export type Entry = {
  t: number; // ms since page load
  level: Level;
  scope: string;
  msg: string;
  data?: unknown;
};

const MAX = 2000;
const buffer: Entry[] = [];
const snapshots: { label: string; html: string }[] = [];

let enabled = readFlag();
const listeners = new Set<(e: Entry) => void>();

/** Live feed of every entry (the panel's Log tab). Returns an unsubscribe. */
export function onLog(fn: (e: Entry) => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function readFlag(): boolean {
  try {
    return globalThis.localStorage?.getItem("iudicium.debug") === "1";
  } catch {
    return false;
  }
}

export function setDebug(on: boolean) {
  enabled = on;
  try {
    if (on) localStorage.setItem("iudicium.debug", "1");
    else localStorage.removeItem("iudicium.debug");
  } catch {
    /* storage blocked */
  }
}

export const isDebug = () => enabled;

const COLORS: Record<Level, string> = { debug: "#888", info: "#1565c0", warn: "#e65100", error: "#c62828" };

function write(level: Level, scope: string, msg: string, data?: unknown) {
  const entry: Entry = { t: Math.round(performance.now()), level, scope, msg, data };
  buffer.push(entry);
  if (buffer.length > MAX) buffer.splice(0, buffer.length - MAX);
  for (const fn of listeners) fn(entry);
  if (!enabled && (level === "debug" || level === "info")) return;
  const fn = level === "error" ? console.error : level === "warn" ? console.warn : console.log;
  const head = [`%c[iudicium:${scope}]%c ${msg}`, `color:${COLORS[level]};font-weight:600`, "color:inherit"];
  if (data === undefined) fn(...head);
  else fn(...head, data);
}

export type Logger = {
  debug(msg: string, data?: unknown): void;
  info(msg: string, data?: unknown): void;
  warn(msg: string, data?: unknown): void;
  error(msg: string, data?: unknown): void;
  /** Logs how long `fn` took. */
  time<T>(msg: string, fn: () => Promise<T>): Promise<T>;
};

export function logger(scope: string): Logger {
  return {
    debug: (m, d) => write("debug", scope, m, d),
    info: (m, d) => write("info", scope, m, d),
    warn: (m, d) => write("warn", scope, m, d),
    error: (m, d) => write("error", scope, m, d),
    async time(msg, fn) {
      const start = performance.now();
      try {
        return await fn();
      } finally {
        write("debug", scope, `${msg} (${Math.round(performance.now() - start)} ms)`);
      }
    },
  };
}

/** Keep a field's markup for the report (trimmed: no classes, styles or icons). */
export function snapshot(label: string, el: Element | undefined) {
  if (!el) return;
  const html = el.outerHTML
    .replace(/\s(class|style)="[^"]*"/g, "")
    .replace(/<svg[\s\S]*?<\/svg>/g, "<svg/>")
    .slice(0, 4000);
  snapshots.push({ label, html });
  if (snapshots.length > 30) snapshots.shift();
}

export function clearLog() {
  buffer.length = 0;
  snapshots.length = 0;
}

export function fmt(data: unknown): string {
  if (data === undefined) return "";
  try {
    const s = typeof data === "string" ? data : JSON.stringify(data);
    return " " + (s.length > 600 ? s.slice(0, 600) + "…" : s);
  } catch {
    return " [unserializable]";
  }
}

/** Plain-text report for bug reports. Contains what the page and your
 *  profile put into fields, so check it before sharing. */
export function dump(context: Record<string, string> = {}): string {
  const lines = [
    "iudicium autofill debug log",
    ...Object.entries({ time: new Date().toISOString(), url: location.origin + location.pathname, ...context }).map(([k, v]) => `${k}: ${v}`),
    "",
    ...buffer.map((e) => `${String(e.t).padStart(7)} ${e.level.toUpperCase().padEnd(5)} [${e.scope}] ${e.msg}${fmt(e.data)}`),
  ];
  if (snapshots.length) {
    lines.push("", "--- field markup (failed / unrecognized) ---");
    for (const s of snapshots) lines.push(`# ${s.label}`, s.html, "");
  }
  return lines.join("\n");
}

export const entries = () => [...buffer];
