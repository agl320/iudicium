// Resume data model.
//
// Points (bullets) belong to exactly one entry (a job, project, degree, skills
// group...). Each entry keeps a pool of points: `active` ones are printed in
// order, inactive ones wait in the pool to be swapped in. Points never move
// between entries or sections; entries never move between sections.

export type Point = {
  id: string;
  text: string; // **bold** is supported
  active: boolean;
};

export type Entry = {
  id: string;
  title: string; // e.g. company or school (bold, left)
  date: string; // right-aligned on the title line
  subtitle: string; // e.g. role or degree (italic, left)
  location: string; // right-aligned on the subtitle line
  // Plain lines (e.g. "Languages: Python, C++") instead of bullet points.
  plain: boolean;
  points: Point[];
};

export type Section = {
  id: string;
  title: string;
  entries: Entry[];
};

export type FontKey =
  | "cm"
  | "charter"
  | "garamond"
  | "sourceSerif"
  | "sourceSans"
  | "calibri"
  | "georgia"
  | "arial"
  | "times";

export type ExportFormat = "pdf" | "docx" | "tex" | "txt";

export const FORMAT_LABELS: Record<ExportFormat, string> = { pdf: "PDF", docx: ".docx", tex: ".tex", txt: ".txt" };

export type Style = {
  font: FontKey;
  fontSize: number; // pt
  margin: number; // inches, all sides
  lineHeight: number; // multiple of font size
  sectionGap: number; // pt above each section heading
  entryGap: number; // pt between entries
  pointGap: number; // pt between bullet points
  headerAlign: "center" | "left";
};

export type Resume = {
  name: string;
  contact: string[]; // shown joined by " | "
  sections: Section[];
  style: Style;
};

type FontInfo = {
  label: string;
  css: string;
  // The Word font a .docx uses: the font itself when Word ships it (docxName
  // set), otherwise the closest one. Fonts are not embedded, which keeps the
  // file small; Word fonts show on screen through metric-compatible clones
  // (Carlito, Gelasio, Arimo, Tinos), so line breaks match Word.
  word: FontKey;
  docxName?: string;
};

export const FONTS: Record<FontKey, FontInfo> = {
  cm: {
    label: "Computer Modern",
    css: "'Computer Modern Serif', 'Latin Modern Roman', serif",
    word: "times",
  },
  charter: {
    label: "Charter",
    css: "'Charis SIL', Charter, 'Bitstream Charter', serif",
    word: "georgia",
  },
  garamond: {
    label: "EB Garamond",
    css: "'EB Garamond', Garamond, serif",
    word: "times",
  },
  sourceSerif: {
    label: "Source Serif",
    css: "'Source Serif 4', 'Source Serif Pro', serif",
    word: "georgia",
  },
  sourceSans: {
    label: "Source Sans",
    css: "'Source Sans 3', 'Source Sans Pro', sans-serif",
    word: "calibri",
  },
  calibri: {
    label: "Calibri",
    css: "Calibri, Carlito, sans-serif",
    word: "calibri",
    docxName: "Calibri",
  },
  georgia: {
    label: "Georgia",
    css: "Georgia, Gelasio, serif",
    word: "georgia",
    docxName: "Georgia",
  },
  arial: {
    label: "Arial",
    css: "Arial, Arimo, sans-serif",
    // Helvetica has Arial's widths.
    word: "arial",
    docxName: "Arial",
  },
  times: {
    label: "Times New Roman",
    css: "'Times New Roman', Tinos, serif",
    word: "times",
    docxName: "Times New Roman",
  },
};

/** Fonts each format reproduces exactly: .docx is limited to Word's own
 *  fonts, .tex to Computer Modern (LaTeX's own; other TeX fonts differ in
 *  width from their web versions, so lines would wrap differently). */
export function fontsFor(format: ExportFormat): FontKey[] {
  const all = Object.keys(FONTS) as FontKey[];
  if (format === "docx") return all.filter((key) => FONTS[key].docxName);
  if (format === "tex") return ["cm"];
  return all;
}

/** The font a format actually renders (Word swaps in its own; LaTeX always
 *  uses Computer Modern). */
export function effectiveFont(font: FontKey, format: ExportFormat): FontKey {
  const known = font in FONTS ? font : DEFAULT_STYLE.font;
  if (format === "docx") return FONTS[known].word;
  if (format === "tex") return "cm";
  return known;
}

// Layout constants shared by the page (CSS), the .docx and the .tex, so all
// three are built from the same numbers. Sizes are multiples of the body font
// size unless noted.
export const LAYOUT = {
  nameSize: 2.05,
  nameLeading: 1.1, // line height, × name size
  nameTracking: 0.01, // em of the name
  contactGap: 0.25, // above the contact line
  headerGap: 0.15, // below the header
  headingSize: 1.15,
  headingLeading: 1.25, // × heading size
  headingTracking: 0.04, // em of the heading
  smallCaps: 0.7, // size of the small capitals in headings
  headingRulePad: 0.08, // text to rule, em of the heading
  headingAfter: 0.3, // rule to first entry, em of the heading
  rule: 0.6, // pt
  listGap: 0.1, // above a list of points
  bulletIndent: 1.1, // text indent of a point
  bulletWidth: 0.8, // box the bullet sits in (hangs into the indent)
  separator: " | ", // between contact items
  separatorColor: "#777777",
} as const;

export const STYLE_LIMITS = {
  fontSize: { min: 9, max: 12.5, step: 0.5, unit: "pt" },
  margin: { min: 0.3, max: 1.25, step: 0.05, unit: "in" },
  lineHeight: { min: 1, max: 1.6, step: 0.05, unit: "×" },
  sectionGap: { min: 0, max: 20, step: 1, unit: "pt" },
  entryGap: { min: 0, max: 16, step: 1, unit: "pt" },
  pointGap: { min: 0, max: 6, step: 0.5, unit: "pt" },
} as const;

export const DEFAULT_STYLE: Style = {
  font: "cm",
  fontSize: 10.5,
  margin: 0.6,
  lineHeight: 1.2,
  sectionGap: 10,
  entryGap: 6,
  pointGap: 1,
  headerAlign: "center",
};

export function uid(): string {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
}

export function newPoint(text = "", active = true): Point {
  return { id: uid(), text, active };
}

export function newEntry(partial: Partial<Entry> = {}): Entry {
  return {
    id: uid(),
    title: "",
    date: "",
    subtitle: "",
    location: "",
    plain: false,
    points: [],
    ...partial,
  };
}

export function newSection(title = "New Section", entries: Entry[] = []): Section {
  return { id: uid(), title, entries };
}

export function sampleResume(): Resume {
  return {
    name: "Alex Morgan",
    contact: ["Vancouver, BC", "alex@example.com", "(604) 555-0123", "linkedin.com/in/alexmorgan"],
    style: { ...DEFAULT_STYLE },
    sections: [
      newSection("Experience", [
        newEntry({
          title: "Northwind Systems",
          date: "May 2024 – Present",
          subtitle: "HRIS Analyst II",
          location: "Burnaby, BC",
          points: [
            newPoint("Owned **Workday HCM** configuration for 3,000 employees across Canada and the US."),
            newPoint("Automated payroll reconciliation reports, cutting month-end close by **2 days**."),
            newPoint("Led the UKG to Workday time-tracking migration with zero missed pay runs."),
            newPoint("Built Power BI dashboards for headcount and attrition used by HR leadership.", false),
            newPoint("Trained 40 HR partners on new self-service workflows.", false),
          ],
        }),
        newEntry({
          title: "Pacific Health Group",
          date: "Jan 2021 – Apr 2024",
          subtitle: "Payroll Specialist",
          location: "Vancouver, BC",
          points: [
            newPoint("Processed bi-weekly payroll for 1,200 unionized and salaried staff."),
            newPoint("Resolved CRA and ROE discrepancies, maintaining 99.8% payroll accuracy."),
            newPoint("Documented year-end T4 procedures adopted as the team standard.", false),
          ],
        }),
      ]),
      newSection("Education", [
        newEntry({
          title: "Simon Fraser University",
          date: "2016 – 2020",
          subtitle: "B.B.A., Human Resource Management",
          location: "Burnaby, BC",
          points: [newPoint("CPHR coursework; Dean's Honour Roll.")],
        }),
      ]),
      newSection("Skills", [
        newEntry({
          plain: true,
          points: [
            newPoint("**Systems:** Workday HCM, UKG Pro, ADP, SuccessFactors"),
            newPoint("**Tools:** Excel (Power Query), Power BI, SQL"),
            newPoint("**Certifications:** CPM (National Payroll Institute)", false),
          ],
        }),
      ]),
    ],
  };
}
