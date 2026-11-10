import { useEffect, useState } from "react";

function current(): string {
  return window.location.hash.replace(/^#/, "") || "/";
}

/** Minimal hash router ("#/resume"), so the static Netlify build needs no
 *  rewrite rules. */
export function useHashRoute(): string {
  const [route, setRoute] = useState(current);
  useEffect(() => {
    const onChange = () => setRoute(current());
    window.addEventListener("hashchange", onChange);
    return () => window.removeEventListener("hashchange", onChange);
  }, []);
  return route;
}

export function navigate(route: string): void {
  window.location.hash = route;
}
