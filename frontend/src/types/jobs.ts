export type JobPosting = {
  id: number;
  company: string;
  company_url: string;
  title: string;
  url: string;
  source: string;
  location: string;
  // Track key from the backend config ("tech_intern", "hr"); may be empty.
  category: string | null;
  // Advertised pay, e.g. "CA$92,900–129,200/yr"; null/empty when unknown.
  salary?: string | null;
  first_seen: string;
  last_seen: string;
};
