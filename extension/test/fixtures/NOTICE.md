# ATS fixtures (greenhouse/, ashby/, lever/, generic/)

- `greenhouse/application.html`, `ashby/application.html`, `lever/application.html`:
  the application form cut from public job postings on 2026-11-14
  (job-boards.greenhouse.io/gitlab, jobs.ashbyhq.com/ramp, jobs.lever.co/palantir),
  rendered in Chrome and saved with scripts, styles, images and hidden template
  data removed. Only the form markup is kept, to test field detection against
  the real structure. `test/ats-mocks.js` adds the widget behaviour the sites'
  own scripts provide (React Select menus, Yes/No toggles, location results).
  Forms change: when a site redesigns, re-save the form and update the tests.
- `generic/application.html`: written for these tests.
