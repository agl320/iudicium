// The review panel shown on application pages, in a shadow root so the
// page's styles can't reach it. Two tabs: Results (what happened to each
// field, highlighted on the page) and Log (live debug log).

import type { ReportItem } from "../core/types";
import { clearLog, dump, entries, fmt, isDebug, onLog, setDebug, type Entry } from "../debug/log";

const PAGE_CSS = `
[data-iud="filled"] { outline: 2px solid #2e7d32 !important; outline-offset: 2px; }
[data-iud="filled-medium"] { outline: 2px dashed #2e7d32 !important; outline-offset: 2px; }
[data-iud="kept"] { outline: 2px dashed #607d8b !important; outline-offset: 2px; }
[data-iud="needs"] { outline: 2px solid #f9a825 !important; outline-offset: 2px; }
[data-iud="failed"] { outline: 2px solid #c62828 !important; outline-offset: 2px; }
[data-iud-flash] { animation: iud-flash 1s ease-out 2; }
@keyframes iud-flash { 50% { box-shadow: 0 0 0 6px rgba(249,168,37,.5); } }
`;

const PANEL_CSS = `
:host { all: initial; }
* { box-sizing: border-box; font-family: system-ui, -apple-system, Segoe UI, sans-serif; }
.launch { position: fixed; right: 18px; bottom: 18px; z-index: 2147483646; border: 0; border-radius: 999px;
  padding: 10px 16px; background: #111; color: #fff; font-size: 13px; font-weight: 600; cursor: pointer;
  box-shadow: 0 6px 20px rgba(0,0,0,.25); }
.launch .warn { background: #e65100; border-radius: 999px; padding: 1px 6px; margin-left: 6px; font-size: 11px; }
.panel { position: fixed; right: 18px; bottom: 18px; z-index: 2147483646; width: 380px; height: min(640px, 80vh);
  display: flex; flex-direction: column; background: #fff; color: #111; border-radius: 12px; font-size: 13px;
  box-shadow: 0 12px 40px rgba(0,0,0,.28); overflow: hidden; resize: both; min-width: 320px; min-height: 260px; }
.panel.wide { width: 560px; }
header { display: flex; align-items: center; gap: 8px; padding: 10px 12px; background: #111; color: #fff; flex: none; }
header b { font-size: 13px; } header span { opacity: .7; flex: 1; font-size: 12px; }
header button { background: none; border: 0; color: #fff; font-size: 16px; cursor: pointer; }
.controls { padding: 10px 12px; display: grid; gap: 8px; border-bottom: 1px solid #eee; flex: none; }
select { width: 100%; padding: 6px; border: 1px solid #ccc; border-radius: 6px; font-size: 13px; }
.row { display: flex; gap: 8px; }
.row button { flex: 1; padding: 8px; border-radius: 6px; border: 1px solid #111; background: #111; color: #fff;
  font-size: 13px; font-weight: 600; cursor: pointer; }
.row button.secondary { background: #fff; color: #111; }
.row button:disabled { opacity: .5; cursor: default; }
label.opt { display: flex; gap: 6px; align-items: center; font-size: 12px; color: #444; }
.tabs { display: flex; border-bottom: 1px solid #eee; flex: none; }
.tabs button { flex: 1; padding: 7px; border: 0; background: #fafafa; font-size: 12px; font-weight: 600; color: #666; cursor: pointer;
  border-bottom: 2px solid transparent; }
.tabs button.on { background: #fff; color: #111; border-bottom-color: #111; }
.tabs .count { font-weight: 500; color: #999; } .tabs .bad { color: #c62828; }
.summary { padding: 8px 12px; font-size: 12px; color: #444; border-bottom: 1px solid #eee; flex: none; }
.empty { padding: 16px 12px; color: #888; font-size: 12px; }
ul.results { list-style: none; margin: 0; padding: 0; overflow: auto; flex: 1; }
ul.results li { padding: 7px 12px; border-bottom: 1px solid #f2f2f2; cursor: pointer; display: grid; grid-template-columns: 16px 1fr; gap: 6px; }
ul.results li:hover { background: #fafafa; }
.dot { width: 10px; height: 10px; border-radius: 50%; margin-top: 4px; }
.filled .dot { background: #2e7d32; } .kept .dot { background: #607d8b; }
.needs .dot { background: #f9a825; } .failed .dot { background: #c62828; }
.q { font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.d { color: #555; font-size: 12px; overflow: hidden; text-overflow: ellipsis; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; }
.tag { font-size: 10px; text-transform: uppercase; letter-spacing: .04em; color: #888; margin-left: 4px; font-weight: 500; }
.toast { padding: 8px 12px; background: #e8f5e9; font-size: 12px; flex: none; }
.logbar { display: flex; gap: 8px; align-items: center; padding: 6px 12px; border-bottom: 1px solid #eee; flex: none; }
.logbar label { flex: 1; }
.logbar button { padding: 4px 10px; border-radius: 6px; border: 1px solid #bbb; background: #fff; font-size: 12px; cursor: pointer; }
ol.log { list-style: none; margin: 0; padding: 4px 0; overflow: auto; flex: 1; background: #111; color: #ddd;
  font: 11px/1.45 ui-monospace, Consolas, monospace; }
ol.log li { padding: 1px 10px; white-space: pre-wrap; word-break: break-word; }
ol.log .t { color: #777; } ol.log .s { color: #90caf9; }
ol.log .debug { color: #aaa; } ol.log .info { color: #e0e0e0; }
ol.log .warn { color: #ffb74d; background: rgba(255,152,0,.08); } ol.log .error { color: #ef9a9a; background: rgba(244,67,54,.12); }
ol.log .data { color: #888; }
`;

export type PanelHandlers = {
  onFill(overwrite: boolean): Promise<void>;
  onRemember(): Promise<void>;
  onProfile(id: string): void;
  onOptions(): void;
  /** Extra lines at the top of a copied log (page, profile...). */
  logContext(): Record<string, string>;
};

const ORDER = { needs: 0, failed: 1, kept: 2, filled: 3 } as const;
const LOG_ROWS = 600;

export class Panel {
  private host = document.createElement("iudicium-autofill");
  private root = this.host.attachShadow({ mode: "open" });
  private open = false;
  private busy = false;
  private overwrite = false;
  private tab: "results" | "log" = "results";
  private report: ReportItem[] = [];
  private toast = "";
  private profiles: { id: string; label: string }[] = [];
  private activeId = "";
  private problems = 0; // warnings/errors since the last fill
  pageLabel = "";
  private handlers: PanelHandlers;
  // The log list survives re-renders so it can stream without rebuilding.
  private logList = document.createElement("ol");

  constructor(handlers: PanelHandlers) {
    this.handlers = handlers;
    const style = document.createElement("style");
    style.textContent = PAGE_CSS;
    document.head.appendChild(style);
    this.logList.className = "log";
    this.rebuildLog();
    onLog((e) => {
      if (e.level === "warn" || e.level === "error") {
        this.problems++;
        if (!this.open || this.tab !== "log") this.scheduleRender();
      }
      this.appendLog(e);
    });
  }

  setProfiles(profiles: { id: string; label: string }[], activeId: string) {
    this.profiles = profiles;
    this.activeId = activeId;
    this.render();
  }

  show(visible: boolean) {
    if (visible && !this.host.isConnected) document.body.appendChild(this.host);
    if (!visible) this.host.remove();
    if (visible) this.render();
  }

  toggle() {
    this.open = !this.open;
    this.show(true);
  }

  setReport(report: ReportItem[]) {
    clearHighlights();
    this.report = report;
    for (const item of report) {
      const el = item.el as HTMLElement | undefined;
      if (!el) continue;
      el.dataset.iud = item.status === "filled" && item.confidence !== "high" ? "filled-medium" : item.status;
    }
    this.render();
  }

  flash(message: string) {
    this.toast = message;
    this.render();
    setTimeout(() => {
      this.toast = "";
      this.render();
    }, 4000);
  }

  // --- Log --------------------------------------------------------------------

  private appendLog(e: Entry) {
    if (e.level === "debug" && !isDebug()) return;
    const list = this.logList;
    const stick = list.scrollTop + list.clientHeight >= list.scrollHeight - 30;
    const li = document.createElement("li");
    li.className = e.level;
    const t = document.createElement("span");
    t.className = "t";
    t.textContent = `${(e.t / 1000).toFixed(2).padStart(7)} `;
    const s = document.createElement("span");
    s.className = "s";
    s.textContent = `${e.scope} `;
    li.append(t, s, document.createTextNode(e.msg));
    if (e.data !== undefined) {
      const d = document.createElement("span");
      d.className = "data";
      d.textContent = fmt(e.data);
      li.append(d);
    }
    list.append(li);
    while (list.childElementCount > LOG_ROWS) list.firstElementChild!.remove();
    if (stick) list.scrollTop = list.scrollHeight;
  }

  private rebuildLog() {
    this.logList.replaceChildren();
    for (const e of entries().slice(-LOG_ROWS * 2)) this.appendLog(e);
  }

  private pending = false;
  private scheduleRender() {
    if (this.pending) return;
    this.pending = true;
    requestAnimationFrame(() => {
      this.pending = false;
      this.render();
    });
  }

  // --- Render ---------------------------------------------------------------------

  private render() {
    const r = this.root;
    r.replaceChildren();
    const style = document.createElement("style");
    style.textContent = PANEL_CSS;
    r.appendChild(style);
    if (!this.open) {
      const b = el("button", "launch", "iudicium · Fill");
      if (this.problems) b.append(el("span", "warn", `${this.problems} ⚠`));
      b.onclick = () => this.toggle();
      r.appendChild(b);
      return;
    }
    const panel = el("div", this.tab === "log" ? "panel wide" : "panel");
    panel.append(this.header(), this.controls(), this.tabs());
    if (this.toast) panel.append(el("div", "toast", this.toast));
    if (this.tab === "results") this.results(panel);
    else this.logView(panel);
    r.appendChild(panel);
    if (this.tab === "log") this.logList.scrollTop = this.logList.scrollHeight;
  }

  private header() {
    const header = el("header");
    header.append(el("b", "", "iudicium"), el("span", "", this.pageLabel));
    const gear = el("button", "", "⚙");
    gear.title = "Edit profiles";
    gear.onclick = () => this.handlers.onOptions();
    const close = el("button", "", "×");
    close.title = "Minimize";
    close.onclick = () => this.toggle();
    header.append(gear, close);
    return header;
  }

  private controls() {
    const controls = el("div", "controls");
    const select = document.createElement("select");
    for (const p of this.profiles) select.add(new Option(p.label, p.id, false, p.id === this.activeId));
    select.onchange = () => {
      this.activeId = select.value;
      this.handlers.onProfile(select.value);
    };
    const opt = el("label", "opt");
    const overwrite = document.createElement("input");
    overwrite.type = "checkbox";
    overwrite.checked = this.overwrite;
    overwrite.onchange = () => (this.overwrite = overwrite.checked);
    opt.append(overwrite, document.createTextNode("Replace values already on the page"));
    const row = el("div", "row");
    const fill = el("button", "", this.busy ? "Filling…" : "Fill this page") as HTMLButtonElement;
    fill.disabled = this.busy;
    fill.onclick = async () => {
      this.busy = true;
      this.problems = 0;
      this.render();
      try {
        await this.handlers.onFill(this.overwrite);
      } finally {
        this.busy = false;
        this.render();
      }
    };
    const remember = el("button", "secondary", "Remember my answers") as HTMLButtonElement;
    remember.title = "Save what you typed into the yellow/red fields for next time";
    remember.disabled = this.busy || !this.report.length;
    remember.onclick = () => this.handlers.onRemember();
    row.append(fill, remember);
    controls.append(select, opt, row);
    return controls;
  }

  private tabs() {
    const tabs = el("div", "tabs");
    const results = el("button", this.tab === "results" ? "on" : "", "Results");
    if (this.report.length) results.append(el("span", "count", ` ${this.report.length}`));
    results.onclick = () => {
      this.tab = "results";
      this.render();
    };
    const log = el("button", this.tab === "log" ? "on" : "", "Log");
    if (this.problems) log.append(el("span", "bad", ` ${this.problems} ⚠`));
    log.onclick = () => {
      this.tab = "log";
      this.render();
    };
    tabs.append(results, log);
    return tabs;
  }

  private results(panel: HTMLElement) {
    if (!this.report.length) {
      panel.append(el("div", "empty", this.busy ? "Filling… (watch the Log tab)" : "Click “Fill this page”. Nothing is submitted."));
      return;
    }
    const count = (s: string) => this.report.filter((i) => i.status === s).length;
    panel.append(
      el("div", "summary", `${count("filled")} filled · ${count("needs")} need you · ${count("failed")} failed · ${count("kept")} kept. Review, then click Next yourself.`),
    );
    const list = el("ul", "results");
    for (const item of [...this.report].sort((a, b) => ORDER[a.status] - ORDER[b.status])) {
      const li = el("li", item.status);
      const body = el("div");
      const q = el("div", "q", item.question || "(no label)");
      q.title = item.question;
      if (item.source) q.append(el("span", "tag", item.source + (item.confidence && item.confidence !== "high" ? "?" : "")));
      const d = el("div", "d", item.detail ?? "");
      d.title = item.detail ?? "";
      body.append(q, d);
      li.append(el("div", "dot"), body);
      li.onclick = () => focusField(item.el);
      list.append(li);
    }
    panel.append(list);
  }

  private logView(panel: HTMLElement) {
    const bar = el("div", "logbar");
    const verbose = el("label", "opt");
    const box = document.createElement("input");
    box.type = "checkbox";
    box.checked = isDebug();
    box.onchange = () => {
      setDebug(box.checked); // also prints to the DevTools console
      this.rebuildLog();
      this.logList.scrollTop = this.logList.scrollHeight;
    };
    verbose.append(box, document.createTextNode("Verbose (every field, resolver and click)"));
    verbose.title = "Also prints to the DevTools console. Remembered for this site.";
    const copy = el("button", "", "Copy");
    copy.title = "Copy the full log (with markup of failed fields) for a bug report. It contains what was filled in, so check before sharing.";
    copy.onclick = async () => {
      try {
        await navigator.clipboard.writeText(dump(this.handlers.logContext()));
        this.flash("Debug log copied. It includes your filled-in values, so check before sharing.");
      } catch (e) {
        this.flash(`Could not copy: ${e instanceof Error ? e.message : e}`);
      }
    };
    const clear = el("button", "", "Clear");
    clear.onclick = () => {
      clearLog();
      this.problems = 0;
      this.rebuildLog();
      this.render();
    };
    bar.append(verbose, copy, clear);
    panel.append(bar, this.logList);
    if (!this.logList.childElementCount) {
      const hint = document.createElement("li");
      hint.className = "debug";
      hint.textContent = "Nothing logged yet. Tick Verbose to see every step.";
      this.logList.append(hint);
    }
  }
}

function el(tag: string, cls = "", textContent = ""): HTMLElement {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (textContent) e.textContent = textContent;
  return e;
}

export function clearHighlights() {
  for (const e of document.querySelectorAll<HTMLElement>("[data-iud]")) delete e.dataset.iud;
}

function focusField(target?: Element) {
  const e = target as HTMLElement | undefined;
  if (!e?.isConnected) return;
  e.scrollIntoView({ behavior: "smooth", block: "center" });
  e.dataset.iudFlash = "";
  setTimeout(() => delete e.dataset.iudFlash, 2100);
}
