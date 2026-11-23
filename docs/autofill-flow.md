# Autofill flow

How a resume in the iudicium site turns into filled applications and a
tracker entry. (GitHub renders these diagrams.)

## The big picture

```mermaid
flowchart LR
  subgraph Site["iudicium site"]
    RB["Resume builder<br/>#/resume"]
    AP["Applications page<br/>#/applications"]
    DB[("Supabase<br/>resumes · autofill_items")]
    RB -- saves --> DB
    AP -- reads resumes,<br/>saves facts + tracker --> DB
  end

  subgraph Ext["Chrome extension"]
    BR["bridge.js<br/>(on the iudicium site)"]
    ST[("chrome.storage<br/>profiles · memory · applications")]
    CS["content.js<br/>(on application pages)"]
    BR <--> ST
    CS <--> ST
  end

  subgraph ATS["Application form"]
    WD["Workday"]
    GH["Greenhouse"]
    AS["Ashby"]
    LV["Lever"]
    GN["Any other site<br/>(toolbar click)"]
  end

  AP -- "Send to extension:<br/>profile + resume .docx" --> BR
  BR -- "tracked applications" --> AP
  CS -- "fills, attaches resume" --> ATS
  ATS -- "Next / Submit clicks:<br/>learn answers, mark Applied" --> CS
```

## One application, step by step

```mermaid
sequenceDiagram
  actor You
  participant Site as iudicium site
  participant Ext as Extension (bridge + storage)
  participant Page as Application form (content.js)

  You->>Site: pick a resume, add address / work authorization / EEO
  Site->>Site: resume → profile (jobs + dates, schools, skills, contact)
  Site->>Ext: putProfile (profile + resume.docx as base64)
  Ext-->>Site: stored ✓ (dashboard shows "in extension")

  You->>Page: open a posting's application
  Page->>Page: detect site (Workday · Greenhouse · Ashby · Lever · generic)
  You->>Page: click "iudicium · Fill"
  loop every field on the page
    Page->>Page: guard → files → profile → EEO → memory → screening rules
    Page->>Page: driver writes it (text, select, combobox, Yes/No buttons, file…)
  end
  Page->>Ext: track(company, role, site, profile, resume) = "started"
  Page-->>You: green filled · yellow needs you · blue suggestion
  You->>Page: review, answer the rest, click Next / Submit
  Page->>Ext: learn your answers · Submit marks "submitted"
  Ext-->>Site: applicationsChanged
  Site->>Site: tracker row: Applied on <date>
  You->>Site: later: Interview / Offer / Rejected
  Site->>Ext: updateApplication(status)
```

## What answers a field

```mermaid
flowchart TD
  Q["Question from the page<br/>(label, kind, options, site key)"] --> G{"Legal / consent /<br/>unknown widget?"}
  G -- yes --> M["Left for you (never filled, never learned)"]
  G -- no --> F{"Upload field for<br/>resume / cover letter?"}
  F -- "yes, profile has a file" --> FA["Attach the file"]
  F -- no --> P{"Contact / address / links /<br/>current job / location?"}
  P -- yes --> PA["Profile fact (replaces page defaults)"]
  P -- no --> E{"Self-identification?"}
  E -- yes --> EA["Your EEO choice (default: decline)"]
  E -- no --> L{"Seen a similar question before?"}
  L -- "≥ 86 % alike" --> LA["Your earlier answer"]
  L -- "50–86 %" --> LS["Suggestion / filled for review"]
  L -- no --> R{"Screening rule?<br/>(authorization, sponsorship,<br/>previous employer, graduation, skills…)"}
  R -- yes --> RA["Reasoned from the profile"]
  R -- no --> N["Marked yellow: needs you"]
```
