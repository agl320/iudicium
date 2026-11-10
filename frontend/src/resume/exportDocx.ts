// Word export laid out like the page: same numbers (LAYOUT), exact line
// heights, and a Word font shown on screen through a metric-compatible clone,
// so line breaks and page count match the preview.
//
// Spacing mirrors the page's CSS, where margins add up (flex columns): every
// gap is written as the next paragraph's "space before" and nothing uses
// "space after", so Word's own rules for combining the two never matter.
// Only the points in use are exported.

import {
  AlignmentType,
  BorderStyle,
  Document,
  HeadingLevel,
  LevelFormat,
  LineRuleType,
  Packer,
  Paragraph,
  Tab,
  TabStopType,
  TextRun,
} from "docx";
import { normalizeText } from "./exportLatex";
import { parseRuns, smallCapsRuns } from "./runs";
import { effectiveFont, FONTS, LAYOUT, type Resume } from "./types";

const TWIPS_PER_INCH = 1440;
const PAGE_WIDTH_IN = 8.5;
const twips = (pt: number) => Math.round(pt * 20);
const halfPoints = (pt: number) => Math.round(pt * 2);
// Paragraph border widths are in eighths of a point, spacing in whole points.
const eighths = (pt: number) => Math.max(2, Math.round(pt * 8));

export async function toDocx(resume: Resume): Promise<Blob> {
  const { style } = resume;
  const font = FONTS[effectiveFont(style.font, "docx")].docxName ?? "Times New Roman";
  const size = style.fontSize;
  const exact = (pt: number) => ({ line: twips(pt), lineRule: LineRuleType.EXACT });
  const body = exact(size * style.lineHeight);

  const namePt = size * LAYOUT.nameSize;
  const headingPt = size * LAYOUT.headingSize;
  const textWidth = Math.round((PAGE_WIDTH_IN - 2 * style.margin) * TWIPS_PER_INCH);
  const tabs = [{ type: TabStopType.RIGHT, position: textWidth }];

  const runs = (text: string) =>
    parseRuns(normalizeText(text)).map((run) => new TextRun({ text: run.text, bold: run.bold }));

  const paragraphs: Paragraph[] = [];
  const headerAlign = style.headerAlign === "center" ? AlignmentType.CENTER : AlignmentType.LEFT;

  paragraphs.push(
    new Paragraph({
      alignment: headerAlign,
      spacing: { before: 0, after: 0, ...exact(namePt * LAYOUT.nameLeading) },
      children: [
        new TextRun({
          text: normalizeText(resume.name),
          bold: true,
          size: halfPoints(namePt),
          characterSpacing: twips(namePt * LAYOUT.nameTracking),
        }),
      ],
    }),
  );
  const contact = resume.contact.map(normalizeText).filter(Boolean);
  if (contact.length) {
    paragraphs.push(
      new Paragraph({
        alignment: headerAlign,
        spacing: { before: twips(size * LAYOUT.contactGap), after: 0, ...body },
        children: contact.flatMap((item, index) => [
          ...(index > 0 ? [new TextRun({ text: LAYOUT.separator, color: LAYOUT.separatorColor.slice(1) })] : []),
          new TextRun(item),
        ]),
      }),
    );
  }

  resume.sections.forEach((section, sectionIndex) => {
    const above = (sectionIndex === 0 ? size * LAYOUT.headerGap : 0) + style.sectionGap;
    // A real "Heading 1" so parsers (Workday, Taleo, ...) see section boundaries.
    paragraphs.push(
      new Paragraph({
        heading: HeadingLevel.HEADING_1,
        keepNext: true,
        spacing: { before: twips(above), after: 0, ...exact(headingPt * LAYOUT.headingLeading) },
        border: {
          bottom: {
            style: BorderStyle.SINGLE,
            size: eighths(LAYOUT.rule),
            color: "111111",
            space: Math.round(headingPt * LAYOUT.headingRulePad),
          },
        },
        children: smallCapsRuns(normalizeText(section.title)).map(
          (run) => new TextRun({ text: run.text, ...(run.small ? { size: halfPoints(headingPt * LAYOUT.smallCaps) } : {}) }),
        ),
      }),
    );

    section.entries.forEach((entry, entryIndex) => {
      // Gap carried into the entry's first paragraph.
      let pending = entryIndex === 0 ? headingPt * LAYOUT.headingAfter : style.entryGap;
      const before = (extra = 0) => {
        const value = pending + extra;
        pending = 0;
        return twips(value);
      };

      if (entry.title || entry.date) {
        paragraphs.push(
          new Paragraph({
            tabStops: tabs,
            keepNext: true,
            spacing: { before: before(), after: 0, ...body },
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
            keepNext: true,
            spacing: { before: before(), after: 0, ...body },
            children: [
              new TextRun({ text: normalizeText(entry.subtitle), italics: true }),
              new TextRun({ children: [new Tab(), normalizeText(entry.location)], italics: true }),
            ],
          }),
        );
      }
      const points = entry.points.filter((p) => p.active && normalizeText(p.text));
      points.forEach((point, pointIndex) => {
        const gap = pointIndex === 0 ? size * LAYOUT.listGap : style.pointGap;
        paragraphs.push(
          new Paragraph({
            ...(entry.plain ? {} : { numbering: { reference: "points", level: 0 } }),
            // Like the page (break-inside: avoid): an entry stays on one page.
            keepLines: true,
            keepNext: pointIndex < points.length - 1,
            spacing: { before: before(gap), after: 0, ...body },
            children: runs(point.text),
          }),
        );
      });
    });
  });

  const margin = Math.round(style.margin * TWIPS_PER_INCH);
  const document = new Document({
    title: `${resume.name} - Resume`,
    creator: resume.name,
    description: "Resume",
    styles: {
      default: {
        // kern: pair kerning from 1pt up, like the browser.
        document: { run: { font, size: halfPoints(size), kern: 2 } },
        heading1: {
          run: {
            font,
            size: halfPoints(headingPt),
            bold: true,
            color: "000000",
            characterSpacing: twips(headingPt * LAYOUT.headingTracking),
          },
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
              style: {
                run: { font },
                paragraph: {
                  indent: { left: twips(size * LAYOUT.bulletIndent), hanging: twips(size * LAYOUT.bulletWidth) },
                },
              },
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
            margin: { top: margin, bottom: margin, left: margin, right: margin },
          },
        },
        children: paragraphs,
      },
    ],
  });

  return Packer.toBlob(document);
}
