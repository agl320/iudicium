// Standalone .tex (compiles with pdflatex, e.g. on Overleaf). Only the points
// in use are exported; the pool stays in the editor.
//
// Lines end with \par (never \\), so empty fields or text starting with "[" or
// "*" cannot break compilation. Ligatures are disabled and glyphs are mapped
// to Unicode so ATS text extraction from the PDF stays clean.

import { parseRuns, smallCapsRuns } from "./runs";
import { LAYOUT, type Resume } from "./types";

const SPECIAL: Record<string, string> = {
  "\\": "\\textbackslash{}",
  "{": "\\{",
  "}": "\\}",
  "$": "\\$",
  "&": "\\&",
  "#": "\\#",
  "%": "\\%",
  "_": "\\_",
  "~": "\\textasciitilde{}",
  "^": "\\textasciicircum{}",
  "<": "\\textless{}",
  "'": "\\textquotesingle{}",
  ">": "\\textgreater{}",
};

// Symbols outside what T1 + utf8 inputenc can typeset.
const SYMBOLS: Record<string, string> = {
  "→": "$\\rightarrow$",
  "←": "$\\leftarrow$",
  "⇒": "$\\Rightarrow$",
  "↔": "$\\leftrightarrow$",
  "≥": "$\\geq$",
  "≤": "$\\leq$",
  "≈": "$\\approx$",
  "±": "$\\pm$",
  "×": "$\\times$",
  "✓": "$\\checkmark$",
  "✔": "$\\checkmark$",
  "•": "\\textbullet{}",
  "·": "\\textperiodcentered{}",
  "…": "\\dots{}",
  "€": "\\texteuro{}",
};

/** Collapses newlines/tabs/odd spaces so one field is one line of text. */
export function normalizeText(text: string): string {
  return text
    .normalize("NFC")
    .replace(/[\u00ad\u200b-\u200d\u2060\ufeff]/g, "")
    .replace(/[\s\u00a0\u202f]+/g, " ")
    .trim();
}

// Latin-1, Latin Extended-A and common punctuation are fine with T1;
// anything else (emoji, CJK, ...) would stop pdflatex, so it is dropped.
function typesettable(char: string): boolean {
  const code = char.codePointAt(0) ?? 0;
  return code < 0x180 || "‘’“”„‚–—".includes(char) || char in SPECIAL || char in SYMBOLS;
}

export function escapeLatex(text: string): string {
  return escapeChars(normalizeText(text));
}

/** Escapes already-normalized text, keeping its edge spaces. */
function escapeChars(text: string): string {
  let out = "";
  for (const char of text) {
    if (SPECIAL[char]) out += SPECIAL[char];
    else if (SYMBOLS[char]) out += SYMBOLS[char];
    else if (char === "–") out += "--";
    else if (char === "—") out += "---";
    else if (typesettable(char)) out += char;
  }
  return out;
}

/** Characters escapeLatex would drop from this text. */
export function droppedInLatex(text: string): string[] {
  return [...new Set([...normalizeText(text)].filter((char) => !typesettable(char)))];
}

function rich(text: string): string {
  return parseRuns(normalizeText(text))
    // Runs are not trimmed: "Owned **Workday** configuration" keeps its spaces.
    .map((run) => (run.bold ? `\\textbf{${escapeChars(run.text)}}` : escapeChars(run.text)))
    .join("");
}

// CSS points are 1/72 in; TeX calls those "bp" (its "pt" is 1/72.27 in).
const pt = (value: number) => `${Number(value.toFixed(2))}bp`;

export function toLatex(resume: Resume): string {
  const { style } = resume;
  const size = style.fontSize;
  const heading = size * LAYOUT.headingSize;
  const name = size * LAYOUT.nameSize;
  // \fontsize{size}{baselineskip}: line pitch = size × line height, as in CSS.
  // Line pitches. CSS gives every line a box of its line height, baseline
  // about 70% down; TeX spaces baselines by the next line's pitch. The two
  // agree between same-size lines; where sizes change (name, headings) the
  // gap is corrected by 30% of the difference, and struts (0.7/0.3 of the
  // pitch) stand in for the CSS line box.
  const bodyLine = size * style.lineHeight;
  const nameLine = name * LAYOUT.nameLeading;
  const headingLine = heading * LAYOUT.headingLeading;
  const font = (pts: number, leading: number) => `\\fontsize{${pt(pts)}}{${pt(pts * leading)}}\\selectfont`;
  const out: string[] = [];

  out.push(
    "\\documentclass[letterpaper]{article}",
    `\\usepackage[margin=${style.margin}in]{geometry}`,
    // pdfLaTeX (Overleaf's default) is the target; the pdfTeX-only lines are
    // guarded so XeLaTeX/LuaLaTeX also compile it.
    "\\usepackage{iftex}",
    "\\usepackage[T1]{fontenc}",
    "\\ifPDFTeX\\usepackage[utf8]{inputenc}\\fi",
    // Computer Modern, as on the page (the only font .tex offers).
    "\\usepackage{lmodern}",
    "\\usepackage{amssymb}",
    "\\usepackage{textcomp}",
    "\\usepackage[HTML]{xcolor}",
    // Letter-spacing only; no protrusion/expansion, so lines match the page.
    "\\usepackage[protrusion=false,expansion=false]{microtype}",
    "\\usepackage{enumitem}",
    "\\usepackage[hidelinks]{hyperref}",
    "",
    "% ATS-friendly PDF text: map glyphs to Unicode, no fi/fl ligatures.",
    "\\ifPDFTeX\\input{glyphtounicode}\\pdfgentounicode=1",
    "\\DisableLigatures[f]{encoding = *, family = *}\\fi",
    `\\hypersetup{pdftitle={${escapeLatex(resume.name)} - Resume}, pdfauthor={${escapeLatex(resume.name)}}}`,
    "",
    "% Laid out like the editor's page: ragged right, no hyphenation (a split",
    "% keyword like \"Work-day\" also reads badly to an ATS).",
    "\\pagestyle{empty}",
    "\\setlength{\\parindent}{0pt}",
    "\\setlength{\\parskip}{0pt}",
    `\\setlength{\\topskip}{${pt(0.7 * bodyLine)}}`,
    "\\raggedright",
    "\\hyphenpenalty=10000",
    "\\exhyphenpenalty=10000",
    "% Word spaces keep their natural width (no stretch/shrink), like a browser.",
    "\\AddToHook{selectfont}{\\fontdimen3\\font=0pt\\fontdimen4\\font=0pt}",
    // Letter-spacing needs pdfTeX (microtype); other engines skip it.
    "\\newcommand{\\tracked}[2]{\\ifPDFTeX\\textls[#1]{#2}\\else#2\\fi}",
    // Section heading drawn directly (no titlesec): gap, text, gap, rule, gap.
    `\\newcommand{\\resumesection}[1]{\\par\\penalty0\\vspace{${pt(style.sectionGap + 0.3 * (bodyLine - headingLine))}}{${font(
      heading,
      LAYOUT.headingLeading,
    )}\\bfseries\\tracked{${Math.round(LAYOUT.headingTracking * 1000)}}{#1}\\strut\\par}\\nobreak\\vspace{${pt(
      heading * LAYOUT.headingRulePad,
    )}}\\nobreak\\hrule height ${pt(LAYOUT.rule)}\\nobreak\\vspace{${pt(
      heading * LAYOUT.headingAfter,
    )}}\\nobreak\\prevdepth=\\dp\\strutbox}`,
    `\\setlist[itemize]{label=\\textbullet, align=left, leftmargin=${pt(size * LAYOUT.bulletIndent)}, labelwidth=${pt(
      size * LAYOUT.bulletWidth,
    )}, labelsep=0pt, topsep=0pt, itemsep=${pt(style.pointGap)}, parsep=0pt, partopsep=0pt, beginpenalty=10000, midpenalty=10000}`,
    "",
    "\\begin{document}",
    font(size, style.lineHeight),
    "",
  );

  // Spaces stay outside the colour group: \color would swallow them.
  const separator = ` {\\color[HTML]{${LAYOUT.separatorColor.slice(1)}}${escapeLatex(LAYOUT.separator)}} `;
  const contact = resume.contact.map(escapeLatex).filter(Boolean).join(separator);
  // A group, not a center environment, so no extra space is added around it.
  out.push(`{${style.headerAlign === "center" ? "\\centering" : "\\raggedright"}`);
  if (escapeLatex(resume.name)) {
    out.push(
      `  {${font(name, LAYOUT.nameLeading)}\\bfseries\\tracked{${Math.round(LAYOUT.nameTracking * 1000)}}{${escapeLatex(
        resume.name,
      )}}\\strut\\par}`,
    );
  }
  const nameGap = escapeLatex(resume.name) ? 0.3 * (nameLine - bodyLine) : 0;
  if (contact) out.push(`  \\vspace{${pt(size * LAYOUT.contactGap + nameGap)}}`, `  ${contact}\\par`);
  out.push("}", `\\vspace{${pt(size * LAYOUT.headerGap)}}`, "");

  for (const section of resume.sections) {
    const smallCaps = `\\fontsize{${pt(heading * LAYOUT.smallCaps)}}{0pt}\\selectfont`;
    const caps = smallCapsRuns(normalizeText(section.title))
      .map((run) => (run.small ? `{${smallCaps} ${escapeLatex(run.text)}}` : escapeLatex(run.text)))
      .join("");
    out.push(`\\resumesection{${caps}}`);
    section.entries.forEach((entry, index) => {
      const points = entry.points.filter((p) => p.active && normalizeText(p.text));
      // samepage forbids breaks up to its end, so re-allow one between entries.
      if (index > 0) out.push(`\\penalty0\\vspace{${pt(style.entryGap)}}`);
      const title = escapeLatex(entry.title);
      const date = escapeLatex(entry.date);
      const subtitle = escapeLatex(entry.subtitle);
      const location = escapeLatex(entry.location);
      // Like the page (break-inside: avoid), an entry is never split across
      // pages: samepage, plus no breaks between its paragraphs and items.
      const body: string[] = [];
      // Adds a paragraph, with no page break allowed before it (or its gap).
      const add = (line: string, gap = 0) => {
        if (body.length) body.push(gap ? `\\nopagebreak\\vspace{${pt(gap)}}` : "\\nopagebreak");
        else if (gap) body.push(`\\vspace{${pt(gap)}}`);
        body.push(line);
      };
      if (title || date) add(`\\textbf{${title}}\\hfill ${date}\\par`);
      if (subtitle || location) add(`\\textit{${subtitle}}\\hfill \\textit{${location}}\\par`);
      if (entry.plain) {
        points.forEach((p, i) => add(`${rich(p.text)}\\par`, i === 0 ? size * LAYOUT.listGap : style.pointGap));
      } else if (points.length) {
        add(["\\begin{itemize}", ...points.map((p) => `  \\item ${rich(p.text)}`), "\\end{itemize}"].join("\n"), size * LAYOUT.listGap);
      }
      if (body.length) out.push("\\begin{samepage}", ...body, "\\end{samepage}");
    });
    out.push("");
  }

  out.push("\\end{document}", "");
  return out.join("\n");
}
