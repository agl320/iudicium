import { useEffect, useState } from "react";
import { useAuth } from "../auth/context";
import { MorphLabel } from "./MorphLabel";
import { DOCUMENT_ICON } from "./morphIcons";

function usePrefersReducedMotion(): boolean {
  const [reduce, setReduce] = useState(
    () => typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches,
  );
  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReduce(query.matches);
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);
  return reduce;
}

/**
 * Oversized "Iudicium" that the nav bar crops top and bottom. Helvetica Bold
 * pushed through a low-frequency displacement filter so the strokes wobble;
 * on hover the noise re-seeds a few times a second so the letters "boil".
 */
function Wordmark() {
  const [hover, setHover] = useState(false);
  const reduce = usePrefersReducedMotion();
  return (
    <a
      href="#/"
      aria-label="Iudicium home"
      className="wordmark"
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
    >
      <svg className="absolute size-0" aria-hidden="true">
        <filter
          id="wordmark-wiggle"
          x="-5%"
          y="-10%"
          width="110%"
          height="120%"
          colorInterpolationFilters="sRGB"
        >
          <feTurbulence type="fractalNoise" baseFrequency="0.012 0.022" numOctaves="1" seed="7" result="noise">
            {hover && !reduce ? (
              <animate
                attributeName="seed"
                values="7;11;3;19"
                dur="0.56s"
                calcMode="discrete"
                repeatCount="indefinite"
              />
            ) : null}
          </feTurbulence>
          <feDisplacementMap in="SourceGraphic" in2="noise" scale="12" xChannelSelector="R" yChannelSelector="G" />
          {/* Displacement samples nearest-neighbour, so edges come out fuzzy:
              soften slightly, then re-sharpen the alpha into a clean edge. */}
          <feGaussianBlur stdDeviation="0.7" />
          <feColorMatrix type="matrix" values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 5 -1.9" />
        </filter>
      </svg>
      <span className="wordmark-text" aria-hidden="true">
        Iudicium
      </span>
    </a>
  );
}

/**
 * Top bar shared by every page except the resume editor (which has its own
 * toolbar): the oversized, cropped wordmark (height: `--header-h`, App.css),
 * page links and Account. `right` replaces the Resume builder
 * button.
 */
export function SiteHeader({ right }: { right?: React.ReactNode } = {}) {
  const route = window.location.hash.replace(/^#/, "").split("?")[0] || "/";
  const signedIn = Boolean(useAuth().user);
  const link = (href: string, label: string) => (
    <a
      href={`#${href}`}
      aria-current={route === href ? "page" : undefined}
      className="btn btn-sm btn-ghost hidden shrink-0 sm:inline-flex aria-[current=page]:bg-wash"
    >
      {label}
    </a>
  );
  return (
    <header className="sticky top-0 z-30 border-b border-line bg-paper/70 backdrop-blur-md">
      <div className="mx-auto flex h-[var(--header-h)] max-w-6xl items-center gap-2 px-4">
        <Wordmark />
        {/* Signed out (the sign-in page) shows only the wordmark. */}
        {signedIn ? (
          <>
            {link("/", "Jobs")}
            {link("/applications", "Applications")}
            {link("/trends", "Trends")}
            <a href="#/account" aria-current={route === "/account" ? "page" : undefined} className="btn btn-sm shrink-0">
              Account
            </a>
            {right ?? (
              <a href="#/resume" aria-label="Resume builder" className="btn btn-sm btn-primary morph-btn shrink-0">
                <MorphLabel text="Resume builder" paths={DOCUMENT_ICON} />
              </a>
            )}
          </>
        ) : null}
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
