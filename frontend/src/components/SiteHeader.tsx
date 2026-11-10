/** Top bar shared by the job board and the account pages. */
export function SiteHeader({ right }: { right?: React.ReactNode }) {
  return (
    <header className="sticky top-0 z-30 border-b border-line bg-paper/70 backdrop-blur-md">
      <div className="mx-auto flex h-14 max-w-6xl items-center gap-2 px-4">
        <a href="#/" className="mr-auto flex items-center gap-2 text-[15px] font-semibold tracking-tight">
          <span className="inline-block size-4 rounded-[5px] bg-gradient-to-br from-[#e3277a] to-[#f97a2a] shadow-[inset_0_1px_0_rgb(255_255_255/0.3)]" aria-hidden="true" />
          Iudicium
        </a>
        <a href="#/" className="btn btn-sm btn-ghost hidden sm:inline-flex">
          Jobs
        </a>
        {right ?? (
          <a href="#/resume" className="btn btn-sm btn-primary">
            Resume builder
          </a>
        )}
      </div>
    </header>
  );
}

export function SiteFooter() {
  const links = [
    { label: "GitHub", href: "https://github.com/agl320" },
    { label: "LinkedIn", href: "https://www.linkedin.com/in/the-andrew-lai/" },
    { label: "Contact", href: "https://andrewlai.ca/" },
  ];
  return (
    <footer className="border-t border-line">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-5 gap-y-2 px-4 py-5 text-sm">
        <span className="text-neutral-500">© {new Date().getFullYear()} Iudicium</span>
        <div className="ml-auto flex gap-4">
          {links.map((link) => (
            <a
              key={link.label}
              href={link.href}
              target="_blank"
              rel="noopener noreferrer"
              className="text-neutral-500 transition-colors hover:text-ink"
            >
              {link.label}
            </a>
          ))}
        </div>
      </div>
    </footer>
  );
}
