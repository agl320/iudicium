import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  throw new Error("Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY in environment");
}

// --- Email-link landings ------------------------------------------------------
//
// Runs before the client exists, so problems are caught before supabase-js
// consumes (or silently ignores) the URL:
//   - expired/used links come back as ?error=...&error_description=...
//   - PKCE links (?code=...) only work in the browser that asked for them;
//     elsewhere (phone, another browser) the email is still confirmed, but
//     nothing would happen here.
// Either way the person is sent to #/login with an explanation.

export const AUTH_NOTICE_KEY = "iudicium.auth.notice";
export const RECOVERY_KEY = "iudicium.auth.recovering";

const PROJECT_REF = new URL(SUPABASE_URL).hostname.split(".")[0];
const VERIFIER_KEY = `sb-${PROJECT_REF}-auth-token-code-verifier`;

function cleanUrl(route: string) {
  window.history.replaceState(null, "", `${window.location.pathname}#${route}`);
}

const landing = (() => {
  const query = new URLSearchParams(window.location.search);
  const hash = new URLSearchParams(window.location.hash.replace(/^#\/?[^?&=]*\??/, ""));
  const error = query.get("error_description") ?? hash.get("error_description");
  if (error) {
    const expired = /expired|invalid/i.test(error);
    sessionStorage.setItem(
      AUTH_NOTICE_KEY,
      expired
        ? "That email link has expired or was already used. Sign in, or request a new link below."
        : `Email link failed: ${error}`,
    );
    cleanUrl("/login");
    return "error";
  }
  if (query.has("code")) {
    if (!localStorage.getItem(VERIFIER_KEY)) {
      sessionStorage.setItem(
        AUTH_NOTICE_KEY,
        "Your email is confirmed. Sign in to continue (the link was opened in a different browser than the one you signed up in).",
      );
      cleanUrl("/login");
      return "foreign-code";
    }
    return "code";
  }
  return null;
})();

// One client for the job board (public reads) and accounts (resume builder).
// PKCE puts auth codes in the query string (?code=...), which keeps them out
// of the #/route hash the app uses for navigation.
export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    flowType: "pkce",
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
});

// Subscribed immediately (not in a lazily mounted provider) so the one-time
// PASSWORD_RECOVERY event from a reset link is never missed.
supabase.auth.onAuthStateChange((event) => {
  if (event === "PASSWORD_RECOVERY") {
    sessionStorage.setItem(RECOVERY_KEY, "1");
    window.location.hash = "#/account";
  } else if (event === "SIGNED_IN" && landing === "code") {
    // A link that fell back to the site root (no #/route): go to the builder.
    const route = window.location.hash.replace(/^#/, "");
    if (!route || route === "/") window.location.hash = "#/resume";
  }
});

/** Where auth emails (confirm, magic link, reset) send people back to. */
export function authRedirect(route: string): string {
  return `${window.location.origin}${window.location.pathname}#${route}`;
}
