// Word export with the same layout: name + contact, ruled section headings,
// title/date and subtitle/location lines with right tab stops, bullet lists.
// Only the points in use are exported.

import {
  AlignmentType,
  BorderStyle,
  Document,
  HeadingLevel,
  LevelFormat,
  Packer,
  Paragraph,
  Tab,
  TabStopType,
  TextRun,
} from "docx";
import { normalizeText } from "./exportLatex";
import { parseRuns } from "./runs";
import { FONTS, type Resume } from "./types";

const TWIPS_PER_INCH = 1440;
const PAGE_WIDTH_IN = 8.5;

export async function toDocx(resume: Resume): Promise<Blob> {
  const { style } = resume;
  const font = FONTS[style.font].docx;
  const size = Math.round(style.fontSize * 2); // half-points
  const line = Math.round(240 * style.lineHeight); // 240 = single spacing
  const rightTab = Math.round((PAGE_WIDTH_IN - 2 * style.margin) * TWIPS_PER_INCH);
  const twips = (pt: number) => Math.round(pt * 20);
  const tabs = [{ type: TabStopType.RIGHT, position: rightTab }];

  const runs = (text: string, extra: { italics?: boolean; bold?: boolean } = {}) =>
    parseRuns(normalizeText(text)).map(
      (run) => new TextRun({ text: run.text, bold: run.bold || extra.bold, italics: extra.italics }),
    );

  const paragraphs: Paragraph[] = [];
  const headerAlign = style.headerAlign === "center" ? AlignmentType.CENTER : AlignmentType.LEFT;

  paragraphs.push(
    new Paragraph({
      alignment: headerAlign,
      spacing: { after: 40, line },
      children: [new TextRun({ text: normalizeText(resume.name), bold: true, size: Math.round(size * 1.9) })],
    }),
    new Paragraph({
      alignment: headerAlign,
      spacing: { after: 0, line },
      children: [new TextRun(resume.contact.map(normalizeText).filter(Boolean).join("  |  "))],
    }),
  );

  for (const section of resume.sections) {
    // A real "Heading 1" so parsers (Workday, Taleo, ...) see section boundaries.
    paragraphs.push(
      new Paragraph({
        heading: HeadingLevel.HEADING_1,
        keepNext: true,
        spacing: { before: twips(style.sectionGap), after: 60, line },
        border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: "000000", space: 1 } },
        children: [new TextRun(normalizeText(section.title))],
      }),
    );

    section.entries.forEach((entry, index) => {
      const before = index > 0 ? twips(style.entryGap) : 0;
      let first = true;
      const gap = () => {
        const value = first ? before : 0;
        first = false;
        return value;
      };
      if (entry.title || entry.date) {
        paragraphs.push(
          new Paragraph({
            tabStops: tabs,
            spacing: { before: gap(), after: 0, line },
            keepNext: true,
            children: [
              new TextRun({ text: normalizeText(entry.title), bold: true }),
              new TextRun({ children: [new Tab(), normalizeText(entry.date)] }),
            ],
          }),
        );
      }
      if (entry.subtitle || entry.location) {
        paragraphs.push(
          new Paragraph({
            tabStops: tabs,
            spacing: { before: gap(), after: 0, line },
            children: [
              new TextRun({ text: normalizeText(entry.subtitle), italics: true }),
              new TextRun({ children: [new Tab(), normalizeText(entry.location)], italics: true }),
            ],
          }),
        );
      }
      for (const point of entry.points.filter((p) => p.active && normalizeText(p.text))) {
        paragraphs.push(
          new Paragraph({
            ...(entry.plain ? {} : { numbering: { reference: "points", level: 0 } }),
            spacing: { before: gap(), after: twips(style.pointGap), line },
            children: runs(point.text),
          }),
        );
      }
    });
  }

  const document = new Document({
    title: `${resume.name} - Resume`,
    creator: resume.name,
    description: "Resume",
    styles: {
      default: {
        document: { run: { font, size } },
        heading1: {
          run: { font, size: Math.round(size * 1.2), bold: true, smallCaps: true, color: "000000" },
          paragraph: { spacing: { before: 0, after: 0 } },
        },
      },
    },
    numbering: {
      config: [
        {
          reference: "points",
          levels: [
            {
              level: 0,
              format: LevelFormat.BULLET,
              text: "•",
              alignment: AlignmentType.LEFT,
              style: { paragraph: { indent: { left: 300, hanging: 200 } } },
            },
          ],
        },
      ],
    },
    sections: [
      {
        properties: {
          page: {
            size: { width: PAGE_WIDTH_IN * TWIPS_PER_INCH, height: 11 * TWIPS_PER_INCH },
            margin: {
              top: Math.round(style.margin * TWIPS_PER_INCH),
              bottom: Math.round(style.margin * TWIPS_PER_INCH),
              left: Math.round(style.margin * TWIPS_PER_INCH),
              right: Math.round(style.margin * TWIPS_PER_INCH),
            },
          },
        },
        children: paragraphs,
      },
    ],
  });

  return Packer.toBlob(document);
}
