// Application profile: what the autofill answers from. In the prototype it
// lives in chrome.storage; later it moves to a Supabase `application_profiles`
// row with the same JSON shape (experience/education derived from a resume).

export type Month = string; // "YYYY-MM" (or "YYYY")

export type Experience = {
  company: string;
  title: string;
  location?: string;
  start: Month;
  end?: Month; // omitted = current
  description?: string;
};

export type Education = {
  school: string;
  degree: string; // as written, e.g. "Bachelor of Applied Science"
  level: "highschool" | "diploma" | "associate" | "bachelor" | "master" | "doctorate";
  field?: string;
  gpa?: string;
  start?: Month;
  end?: Month; // graduation (expected)
};

/** Ways forms name each education level, most specific first. */
export const LEVEL_NAMES: Record<Education["level"], string[]> = {
  highschool: ["High School", "Secondary"],
  diploma: ["Diploma", "Certificate", "College"],
  associate: ["Associate's Degree", "Associate"],
  bachelor: ["Bachelor's Degree", "Bachelor", "Bachelors", "Undergraduate"],
  master: ["Master's Degree", "Master", "Masters", "Graduate"],
  doctorate: ["Doctorate", "PhD", "Doctoral"],
};

export type Decline = "decline";

export type Eeo = {
  gender: "male" | "female" | "nonbinary" | Decline;
  hispanicLatino: "yes" | "no" | Decline;
  race: string | Decline; // e.g. "Asian", "White", "Two or more races"
  veteran: "not" | "protected" | Decline;
  disability: "yes" | "no" | Decline;
};

export type Profile = {
  id: string;
  label: string; // "Tech intern", "HRIS"...
  person: {
    firstName: string;
    middleName?: string;
    lastName: string;
    preferredFirstName?: string;
    email: string;
    phone: string; // national format
    phoneType: string; // "Mobile"
    phoneCountry: string; // "Canada" — matched against "Canada (+1)"
    address: { line1: string; line2?: string; city: string; region: string; postalCode: string; country: string };
  };
  links: { linkedin?: string; github?: string; website?: string };
  work: {
    /** Country -> legally allowed to work there. */
    authorized: Record<string, boolean>;
    /** Country -> would need visa sponsorship. */
    sponsorship: Record<string, boolean>;
    homeCountry: string; // used when a question names no country
    willingToRelocate: boolean;
    noticePeriod?: string;
    earliestStart?: string; // "YYYY-MM-DD"
    salaryExpectation?: string;
  };
  screening: {
    over18: boolean;
    relativesAtEmployers: string[]; // employers where a relative works
    /** "How did you hear about us?" — first one the form offers wins. */
    sources: string[];
  };
  eeo: Eeo;
  skills: string[];
  experience: Experience[];
  education: Education[];
};

/** An answer the person gave once and asked to reuse. */
export type SavedAnswer = {
  fingerprint: string; // normalized question, employer replaced by {company}
  question: string; // as last seen
  kind: string;
  value: string | string[] | boolean;
  company?: string; // set = only for this employer
  updated: string;
};

export function sampleProfile(): Profile {
  return {
    id: "sample",
    label: "Tech intern (sample)",
    person: {
      firstName: "Alex",
      lastName: "Morgan",
      email: "alex@example.com",
      phone: "604 555 0123",
      phoneType: "Mobile",
      phoneCountry: "Canada",
      address: { line1: "123 Example St", city: "Vancouver", region: "British Columbia", postalCode: "V6B 1A1", country: "Canada" },
    },
    links: { linkedin: "https://www.linkedin.com/in/alexmorgan", github: "https://github.com/alexmorgan" },
    work: {
      authorized: { Canada: true, "United States": false },
      sponsorship: { Canada: false, "United States": true },
      homeCountry: "Canada",
      willingToRelocate: true,
      noticePeriod: "2 weeks",
    },
    screening: {
      over18: true,
      relativesAtEmployers: [],
      sources: ["Company Website", "Career Site", "LinkedIn", "Job Board", "Other"],
    },
    eeo: { gender: "decline", hispanicLatino: "decline", race: "decline", veteran: "decline", disability: "decline" },
    skills: ["Python", "C++", "TypeScript", "React", "SQL", "Git", "Linux"],
    experience: [
      {
        company: "Northwind Systems",
        title: "Software Engineering Intern",
        location: "Burnaby, BC",
        start: "2025-05",
        end: "2025-08",
        description: "Built internal tooling in Python and React.",
      },
      {
        company: "Pacific Robotics Club",
        title: "Firmware Lead",
        location: "Vancouver, BC",
        start: "2024-09",
        description: "Lead a team of 6 writing C++ motor control firmware.",
      },
    ],
    education: [
      {
        school: "University of British Columbia",
        degree: "Bachelor of Applied Science",
        level: "bachelor",
        field: "Computer Engineering",
        gpa: "3.8",
        start: "2023-09",
        end: "2027-05",
      },
    ],
  };
}
