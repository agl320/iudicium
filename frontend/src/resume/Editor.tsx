import { type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import "./resume.css";
import { HoverArrow } from "../components/HoverArrow";
import { MorphLabel } from "../components/MorphLabel";
import { DOWNLOAD_ICON } from "../components/morphIcons";
import { AtsPanel } from "./AtsPanel";
import { checkAts, toPlainText } from "./ats";
import { toLatex } from "./exportLatex";
import { type FormatOption, FormatPicker } from "./FormatPicker";
import { Inspector } from "./Inspector";
import { Preview, ResumeDocument, type Selection } from "./Preview";
import { useResumeStore } from "./store";
import {
  effectiveFont,
  type ExportFormat,
  FONTS,
  fontsFor,
  FORMAT_LABELS,
  type Resume,
  sampleResume,
  type Style,
  STYLE_LIMITS,
} from "./types";
import { Button, Label, PanelSection } from "./ui";

function download(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

const FORMAT_KEY = "iudicium.exportFormat";

const FORMAT_OPTIONS: FormatOption<ExportFormat>[] = [
  { key: "pdf", label: FORMAT_LABELS.pdf, title: "Print to PDF (most ATS read it)" },
  { key: "docx", label: FORMAT_LABELS.docx, title: "Word document (safest for older ATS)" },
  { key: "tex", label: FORMAT_LABELS.tex, title: "LaTeX source, e.g. for Overleaf" },
  { key: "txt", label: FORMAT_LABELS.txt, title: "Plain text for “paste your resume” boxes" },
];

function savedFormat(): ExportFormat {
  const saved = localStorage.getItem(FORMAT_KEY);
  return FORMAT_OPTIONS.some((option) => option.key === saved) ? (saved as ExportFormat) : "pdf";
}

function fileStem(name: string): string {
  const stem = name.trim().replace(/[^\p{L}\p{N}\- ]+/gu, "").trim().replace(/\s+/g, "_");
  return stem || "resume";
}

function Slider({
  label,
  value,
  limits,
  onChange,
}: {
  label: string;
  value: number;
  limits: { min: number; max: number; step: number; unit: string };
  onChange: (value: number) => void;
}) {
  return (
    <label className="block">
      <div className="flex items-baseline justify-between">
        <Label>{label}</Label>
        <span className="text-[11px] tabular-nums text-neutral-500">
          {value}
          {limits.unit}
        </span>
      </div>
      <input
        type="range"
        className="rb-range w-full"
        min={limits.min}
        max={limits.max}
        step={limits.step}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
      />
    </label>
  );
}

type EditorProps = {
  initial: Resume;
  // Called with every change; the workspace saves it (browser or account).
  onChange: (resume: Resume) => void;
  // Shown next to the title (resume switcher, save status).
  toolbar?: ReactNode;
  // Shown at the far right (account menu / sign-in).
  account?: ReactNode;
  storageNote: string;
};

export function Editor({ initial, onChange, toolbar, account, storageNote }: EditorProps) {
  const { resume, actions, undo, redo, canUndo, canRedo } = useResumeStore(initial);

  const first = useRef(true);
  useEffect(() => {
    // The initial document is already saved; report edits only.
    if (first.current) {
      first.current = false;
      return;
    }
    onChange(resume);
  }, [resume, onChange]);
  const [selection, setSelection] = useState<Selection>(null);
  const [busy, setBusy] = useState<string>("");
  const [view, setView] = useState<"page" | "text">("page");
  const [format, setFormat] = useState<ExportFormat>(savedFormat);
  useEffect(() => localStorage.setItem(FORMAT_KEY, format), [format]);
  const atsIssues = useMemo(() => checkAts(resume, format), [resume, format]);
  const style = resume.style;
  // The font picked, and the one the selected format really renders.
  const chosenFont = effectiveFont(style.font, "pdf");
  const shownFont = effectiveFont(style.font, format);
  const setStyle = (patch: Partial<Style>) => actions.setStyle(patch);

  // Undo / redo / deselect. Text fields are included on purpose: every
  // keystroke is in the editor's history (merged per field), and the
  // browser's own undo does not work reliably on React-controlled fields.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const mod = event.ctrlKey || event.metaKey;
      const key = event.key.toLowerCase();
      if (mod && key === "z") {
        event.preventDefault();
        if (event.shiftKey) redo();
        else undo();
      } else if (mod && key === "y") {
        event.preventDefault();
        redo();
      } else if (event.key === "Escape") {
        // Popovers/rename fields handle their own Escape first.
        if (event.defaultPrevented) return;
        (document.activeElement as HTMLElement | null)?.blur();
        setSelection(null);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [undo, redo]);

  // Print with the chosen margins on every page.
  useEffect(() => {
    const tag = document.createElement("style");
    tag.textContent = `@page { size: letter; margin: ${style.margin}in; }`;
    document.head.appendChild(tag);
    return () => tag.remove();
  }, [style.margin]);

  async function exportDocx() {
    setBusy("Building .docx…");
    try {
      const { toDocx } = await import("./exportDocx");
      download(await toDocx(resume), `${fileStem(resume.name)}.docx`);
    } finally {
      setBusy("");
    }
  }

  function exportText() {
    download(new Blob([toPlainText(resume)], { type: "text/plain;charset=utf-8" }), `${fileStem(resume.name)}.txt`);
  }

  // The browser uses the page title as the PDF title / suggested filename.
  function exportPdf() {
    const previous = document.title;
    document.title = `${resume.name || "Resume"} - Resume`;
    window.print();
    document.title = previous;
  }

  function exportLatex() {
    download(new Blob([toLatex(resume)], { type: "application/x-tex" }), `${fileStem(resume.name)}.tex`);
  }

  function exportSelected() {
    if (format === "pdf") exportPdf();
    else if (format === "docx") void exportDocx();
    else if (format === "tex") exportLatex();
    else exportText();
  }

  return (
    <div
      className="rb-app flex h-screen flex-col bg-wash text-neutral-900"
    >
      {/* Top bar */}
      {/* Equal minmax(0,1fr) side columns keep the middle island centred on
          the viewport whatever the sides hold. */}
      <header className="rb-screen grid h-14 shrink-0 grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-3 border-b border-line bg-paper px-4">
        <div className="flex min-w-0 items-center gap-3">
          <a href="#/" className="btn btn-sm btn-ghost hover-arrow-host shrink-0">
            <HoverArrow direction="left" />
            Jobs
          </a>
          {toolbar}
          {/* Undo/redo island, centred in the gap before the middle island. */}
          <div className="flex min-w-0 flex-1 justify-center">
            <div className="flex items-center gap-0.5 rounded-xl border border-line bg-paper p-1 shadow-soft">
              <Button size="xs" variant="ghost" onClick={undo} disabled={!canUndo} title="Undo (Ctrl+Z)">
                ↶ Undo
              </Button>
              <span className="h-4 w-px bg-line" aria-hidden="true" />
              <Button size="xs" variant="ghost" onClick={redo} disabled={!canRedo} title="Redo (Ctrl+Shift+Z)">
                ↷ Redo
              </Button>
            </div>
          </div>
        </div>
        {/* Island: format + export. The chosen format also drives the ATS check. */}
        <div className="flex items-center gap-2 rounded-xl border border-line bg-paper p-1 shadow-soft">
          <FormatPicker label="Export format" options={FORMAT_OPTIONS} value={format} onChange={setFormat} />
          <span className="h-5 w-px bg-line" aria-hidden="true" />
          <button
            type="button"
            onClick={exportSelected}
            aria-label={`Export ${FORMAT_LABELS[format]}`}
            className={`btn btn-sm btn-primary morph-btn morph-download${busy ? " is-loading" : ""}`}
          >
            {/* Keyed so switching format replays the letters rising in. */}
            <MorphLabel key={format} text={`Export ${FORMAT_LABELS[format]}`} paths={DOWNLOAD_ICON} />
          </button>
        </div>
        <div className="flex min-w-0 items-center justify-end gap-2">
          {busy ? <span className="text-xs text-neutral-400">{busy}</span> : null}
          {account}
        </div>
      </header>

      <div className="rb-screen flex min-h-0 flex-1">
        {/* Style panel */}
        <aside className="w-64 shrink-0 overflow-y-auto border-r border-line bg-paper">
          <AtsPanel issues={atsIssues} format={FORMAT_LABELS[format]} onSelect={(target) => {
            setView("page");
            setSelection(target ?? null);
          }} />
          {/* Plain text has no fonts or layout. */}
          {format === "txt" ? null : (
            <>
              <PanelSection title="Font">
                {shownFont !== chosenFont ? (
                  <p className="text-[11px] leading-relaxed text-neutral-500">
                    {format === "tex"
                      ? `The .tex uses ${FONTS[shownFont].label}, LaTeX's own font (shown).`
                      : `Word doesn't have ${FONTS[chosenFont].label}, so the .docx uses ${FONTS[shownFont].label} (shown).`}
                  </p>
                ) : null}
                <div className="space-y-1">
                  {fontsFor(format).map((key) => {
                    const current = shownFont === key;
                    return (
                      <button
                        key={key}
                        type="button"
                        onClick={() => setStyle({ font: key })}
                        className={`flex w-full cursor-pointer items-center justify-between rounded-lg border px-3 py-2 text-left transition-colors ${
                          current ? "border-accent bg-hl text-accent-strong" : "border-line bg-paper text-ink hover:bg-wash"
                        }`}
                      >
                        <span style={{ fontFamily: FONTS[key].css }} className="text-[15px]">
                          {FONTS[key].label}
                        </span>
                        <span style={{ fontFamily: FONTS[key].css }} className="text-sm opacity-60">
                          Aa
                        </span>
                      </button>
                    );
                  })}
                </div>
              </PanelSection>
              <PanelSection title="Layout">
                <Slider label="Font size" value={style.fontSize} limits={STYLE_LIMITS.fontSize} onChange={(fontSize) => setStyle({ fontSize })} />
                <Slider label="Margins" value={style.margin} limits={STYLE_LIMITS.margin} onChange={(margin) => setStyle({ margin })} />
                <Slider label="Line height" value={style.lineHeight} limits={STYLE_LIMITS.lineHeight} onChange={(lineHeight) => setStyle({ lineHeight })} />
              </PanelSection>
              <PanelSection title="Spacing">
                <Slider label="Before sections" value={style.sectionGap} limits={STYLE_LIMITS.sectionGap} onChange={(sectionGap) => setStyle({ sectionGap })} />
                <Slider label="Between entries" value={style.entryGap} limits={STYLE_LIMITS.entryGap} onChange={(entryGap) => setStyle({ entryGap })} />
                <Slider label="Between points" value={style.pointGap} limits={STYLE_LIMITS.pointGap} onChange={(pointGap) => setStyle({ pointGap })} />
                <div>
                  <Label>Header</Label>
                  <div className="inline-flex rounded-lg bg-wash p-[3px] text-xs">
                    {(["center", "left"] as const).map((align) => (
                      <button
                        key={align}
                        type="button"
                        onClick={() => setStyle({ headerAlign: align })}
                        className={`cursor-pointer rounded-md px-3 py-1 font-semibold capitalize transition-all ${
                          style.headerAlign === align ? "bg-paper text-ink shadow-sm" : "text-neutral-500 hover:text-ink"
                        }`}
                      >
                        {align}
                      </button>
                    ))}
                  </div>
                </div>
              </PanelSection>
            </>
          )}
          <PanelSection title="Document">
            <div className="flex flex-wrap gap-2">
              <Button
                variant="accent"
                icon="plus"
                onClick={() => {
                  const sectionId = actions.addSection();
                  setSelection({ kind: "section", sectionId });
                }}
              >
                Section
              </Button>
              <Button
                variant="ghost"
                onClick={() => {
                  if (confirm("Replace the current resume with the example? (Undo restores it.)")) {
                    actions.replace(sampleResume());
                    setSelection(null);
                  }
                }}
              >
                Load example
              </Button>
            </div>
            <p className="text-[11px] leading-relaxed text-neutral-400">
              {storageNote}
            </p>
          </PanelSection>
        </aside>

        {/* Page */}
        <main className="relative min-w-0 flex-1 overflow-auto bg-[radial-gradient(600px_360px_at_25%_-120px,rgb(225_29_116/0.05),transparent_70%),radial-gradient(600px_360px_at_75%_-120px,rgb(249_115_22/0.05),transparent_70%),linear-gradient(180deg,#f7f7f8,#f0f1f4)]">
          {format === "txt" ? null : (
            <div className="sticky top-0 z-10 flex justify-center pt-3">
              <div className="inline-flex rounded-lg border border-line bg-wash p-[3px] text-xs shadow-soft">
                {(["page", "text"] as const).map((key) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setView(key)}
                    className={`cursor-pointer rounded-md px-3 py-1.5 font-semibold transition-all ${
                      view === key ? "bg-paper text-ink shadow-sm" : "text-neutral-500 hover:text-ink"
                    }`}
                  >
                    {key === "page" ? "Page" : "What an ATS reads"}
                  </button>
                ))}
              </div>
            </div>
          )}
          {/* The .txt export is exactly this text, so it is the preview. */}
          {view === "page" && format !== "txt" ? (
            <Preview resume={resume} format={format} actions={actions} selection={selection} onSelect={setSelection} />
          ) : (
            <div className="flex justify-center px-12 pb-24 pt-6">
              <pre className="rb-panel-in w-full max-w-[816px] whitespace-pre-wrap border border-line bg-paper p-10 font-mono text-[12.5px] leading-relaxed text-ink shadow-soft">
                {toPlainText(resume)}
              </pre>
            </div>
          )}
        </main>

        {/* Inspector */}
        <aside className="w-80 shrink-0 overflow-y-auto border-l border-line bg-paper">
          <Inspector resume={resume} actions={actions} selection={selection} onSelect={setSelection} />
        </aside>
      </div>

      {/* What gets printed (Export PDF). */}
      <div className="rb-print">
        <ResumeDocument resume={resume} interactive={false} />
      </div>
    </div>
  );
}
