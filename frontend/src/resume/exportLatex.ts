// Standalone .tex (compiles with pdflatex, e.g. on Overleaf). Only the points
// in use are exported; the pool stays in the editor.
//
// Lines end with \par (never \\), so empty fields or text starting with "[" or
// "*" cannot break compilation. Ligatures are disabled and glyphs are mapped
// to Unicode so ATS text extraction from the PDF stays clean.

import { parseRuns } from "./runs";
import { FONTS, type Resume } from "./types";

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

export function escapeLatex(text: string): string {
  let out = "";
  for (const char of normalizeText(text)) {
    if (SPECIAL[char]) out += SPECIAL[char];
    else if (SYMBOLS[char]) out += SYMBOLS[char];
    else if (char === "–") out += "--";
    else if (char === "—") out += "---";
    else {
      const code = char.codePointAt(0) ?? 0;
      // Latin-1, Latin Extended-A and common punctuation are fine with T1;
      // anything else (emoji, CJK, ...) would stop pdflatex, so drop it.
      if (code < 0x180 || "‘’“”„‚".includes(char)) out += char;
    }
  }
  return out;
}

function rich(text: string): string {
  return parseRuns(normalizeText(text))
    .map((run) => (run.bold ? `\\textbf{${escapeLatex(run.text)}}` : escapeLatex(run.text)))
    .join("");
}

const pt = (value: number) => `${Number(value.toFixed(2))}pt`;

export function toLatex(resume: Resume): string {
  const { style } = resume;
  const size = style.fontSize;
  const lead = (factor: number) => `{${pt(size * factor)}}{${pt(size * factor * 1.2)}}`;
  const out: string[] = [];

  out.push(
    "\\documentclass[letterpaper]{article}",
    `\\usepackage[margin=${style.margin}in]{geometry}`,
    "\\usepackage[T1]{fontenc}",
    "\\usepackage[utf8]{inputenc}",
    FONTS[style.font].latex,
    "\\usepackage{amssymb}",
    "\\usepackage{textcomp}",
    "\\usepackage{microtype}",
    "\\usepackage{enumitem}",
    "\\usepackage{titlesec}",
    "\\usepackage[hidelinks]{hyperref}",
    "",
    "% ATS-friendly PDF text: map glyphs to Unicode, no fi/fl ligatures.",
    "\\input{glyphtounicode}",
    "\\pdfgentounicode=1",
    "\\DisableLigatures[f]{encoding = *, family = *}",
    `\\hypersetup{pdftitle={${escapeLatex(resume.name)} - Resume}, pdfauthor={${escapeLatex(resume.name)}}}`,
    "",
    "\\pagestyle{empty}",
    "\\setlength{\\parindent}{0pt}",
    "\\setlength{\\parskip}{0pt}",
    `\\titleformat{\\section}{\\fontsize${lead(1.15)}\\selectfont\\bfseries\\scshape}{}{0pt}{}[\\vspace{-4pt}\\titlerule]`,
    `\\titlespacing*{\\section}{0pt}{${pt(style.sectionGap)}}{4pt}`,
    `\\setlist[itemize]{leftmargin=1.2em, topsep=1pt, itemsep=${pt(style.pointGap)}, parsep=0pt, partopsep=0pt}`,
    "",
    "\\begin{document}",
    `\\fontsize{${pt(size)}}{${pt(size * style.lineHeight)}}\\selectfont`,
    "",
  );

  const align = style.headerAlign === "center" ? "center" : "flushleft";
  const name = escapeLatex(resume.name);
  const contact = resume.contact.map(escapeLatex).filter(Boolean).join(" \\textbar{} ");
  out.push(`\\begin{${align}}`);
  if (name) out.push(`  {\\fontsize${lead(2.05)}\\selectfont\\bfseries ${name}\\par}`, "  \\vspace{3pt}");
  if (contact) out.push(`  ${contact}\\par`);
  out.push(`\\end{${align}}`, "\\vspace{-8pt}", "");

  for (const section of resume.sections) {
    out.push(`\\section*{${escapeLatex(section.title)}}`);
    section.entries.forEach((entry, index) => {
      const points = entry.points.filter((p) => p.active && normalizeText(p.text));
      if (index > 0) out.push(`\\vspace{${pt(style.entryGap)}}`);
      const title = escapeLatex(entry.title);
      const date = escapeLatex(entry.date);
      const subtitle = escapeLatex(entry.subtitle);
      const location = escapeLatex(entry.location);
      if (title || date) out.push(`\\textbf{${title}}\\hfill ${date}\\par`);
      if (subtitle || location) out.push(`\\textit{${subtitle}}\\hfill \\textit{${location}}\\par`);
      if (points.length === 0) return;
      if (entry.plain) {
        points.forEach((p, i) => {
          if (i > 0) out.push(`\\vspace{${pt(style.pointGap)}}`);
          out.push(`${rich(p.text)}\\par`);
        });
      } else {
        out.push("\\begin{itemize}");
        points.forEach((p) => out.push(`  \\item ${rich(p.text)}`));
        out.push("\\end{itemize}");
      }
    });
    out.push("");
  }

  out.push("\\end{document}", "");
  return out.join("\n");
}
