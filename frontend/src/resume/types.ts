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

export type FontKey = "cm" | "charter" | "garamond" | "sourceSerif" | "sourceSans";

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

export const FONTS: Record<
  FontKey,
  // docx: closest font that ships with Microsoft Office, so the file looks
  // the same on a recruiter's machine (web fonts are not embedded).
  { label: string; css: string; docx: string; latex: string }
> = {
  cm: {
    label: "Computer Modern",
    css: "'Computer Modern Serif', 'Latin Modern Roman', serif",
    docx: "Cambria",
    latex: "\\usepackage{lmodern}",
  },
  charter: {
    label: "Charter",
    css: "'Charis SIL', Charter, 'Bitstream Charter', serif",
    docx: "Georgia",
    latex: "\\usepackage[charter]{mathdesign}",
  },
  garamond: {
    label: "EB Garamond",
    css: "'EB Garamond', Garamond, serif",
    docx: "Garamond",
    latex: "\\usepackage{ebgaramond}",
  },
  sourceSerif: {
    label: "Source Serif",
    css: "'Source Serif 4', 'Source Serif Pro', serif",
    docx: "Constantia",
    latex: "\\usepackage{sourceserifpro}",
  },
  sourceSans: {
    label: "Source Sans",
    css: "'Source Sans 3', 'Source Sans Pro', sans-serif",
    docx: "Calibri",
    latex: "\\usepackage[default]{sourcesanspro}",
  },
};

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
