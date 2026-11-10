// Point text supports **bold** spans; everything else is plain text.

export type Run = { text: string; bold: boolean };

export function parseRuns(text: string): Run[] {
  const runs: Run[] = [];
  const parts = text.split("**");
  // An unmatched trailing "**" is shown literally.
  const balanced = parts.length % 2 === 1;
  parts.forEach((part, index) => {
    const bold = index % 2 === 1 && (balanced || index < parts.length - 1);
    const value = !balanced && index === parts.length - 1 && index % 2 === 1 ? `**${part}` : part;
    if (value) runs.push({ text: value, bold });
  });
  return runs;
}

export type CapsRun = { text: string; small: boolean };

/**
 * Small caps built by hand (capitals, lowercase drawn as smaller capitals at
 * LAYOUT.smallCaps). Browsers, Word and LaTeX each fake small caps at their
 * own size, so the page, .docx and .tex all use these runs instead.
 */
export function smallCapsRuns(text: string): CapsRun[] {
  const runs: CapsRun[] = [];
  for (const char of text) {
    const upper = char.toUpperCase();
    const small = upper !== char;
    const last = runs.at(-1);
    if (last && last.small === small) last.text += upper;
    else runs.push({ text: upper, small });
  }
  return runs;
}
