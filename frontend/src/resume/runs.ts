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
