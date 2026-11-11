[![Netlify Status](https://api.netlify.com/api/v1/badges/db111ce5-16eb-41b2-9ac4-d47fb8be7742/deploy-status)](https://app.netlify.com/projects/iudicium/deploys)
# iudicium

https://iudicium.netlify.app/

A personal job-search project: it collects postings from company career sites, and includes a resume builder and an application autofill prototype.

- **Job board.** A Python poller reads company career boards every 30 minutes (Workday, Greenhouse, Ashby, Lever, SmartRecruiters and others), sorts postings into tracks (tech internships, HR/HRIS), filters them by region and salary, stores them in Postgres and posts new ones to Discord. Companies and tracks are set in `backend/config/`.
- **Website.** A React frontend for browsing and searching the stored postings by track.
- **Resume builder.** Edits resumes as sections, entries and bullet points, with a pool of alternate points per entry. Exports PDF, .docx, .tex and .txt laid out for applicant tracking systems. Resumes save to a Supabase account or to the browser.
- **Autofill (prototype).** A Chrome extension in `extension/` that fills Workday applications page by page from a saved profile. It answers what it can from the profile (contact details, work history, education, self-identification, common screening questions), marks the rest for the user, and never submits. Answers the user types can be saved and reused on later applications.
