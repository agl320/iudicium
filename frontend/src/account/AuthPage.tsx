import { AuthProvider } from "../auth/AuthProvider";
import { navigate } from "../hooks/useHashRoute";
import { type FormEvent, useEffect, useState } from "react";
import { useAuth } from "../auth/context";
import { AUTH_NOTICE_KEY } from "../lib/supabase";
import { resendConfirmation, sendMagicLink, sendPasswordReset, signIn, signUp } from "../resume/cloud";
import { Card, Field, Message, Shell, SubmitButton } from "./Shell";

type Mode = "signin" | "signup" | "magic" | "reset";

const MIN_PASSWORD = 8;

function AuthPageInner() {
  const { user } = useAuth();
  const [mode, setMode] = useState<Mode>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: "error" | "success" | "info"; text: string } | null>(() => {
    // Set when arriving from an email link (expired, other browser, ...).
    const notice = sessionStorage.getItem(AUTH_NOTICE_KEY);
    if (!notice) return null;
    sessionStorage.removeItem(AUTH_NOTICE_KEY);
    return { tone: "info", text: notice };
  });
  const [unconfirmed, setUnconfirmed] = useState(false);

  // Already signed in (or just signed in): go to the editor.
  useEffect(() => {
    if (user) navigate("#/resume");
  }, [user]);

  function switchMode(next: Mode) {
    setMode(next);
    setMessage(null);
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    setMessage(null);
    setUnconfirmed(false);
    const address = email.trim();
    if (!address) return setMessage({ tone: "error", text: "Enter your email address." });
    if ((mode === "signin" || mode === "signup") && password.length < (mode === "signup" ? MIN_PASSWORD : 1)) {
      return setMessage({
        tone: "error",
        text: mode === "signup" ? `Use at least ${MIN_PASSWORD} characters for the password.` : "Enter your password.",
      });
    }
    setBusy(true);
    try {
      if (mode === "signin") {
        await signIn(address, password);
      } else if (mode === "signup") {
        const needsConfirm = await signUp(address, password);
        if (needsConfirm) {
          setMessage({ tone: "success", text: `Check ${address} for a link to confirm your account.` });
        }
      } else if (mode === "magic") {
        await sendMagicLink(address);
        setMessage({ tone: "success", text: `If ${address} has an account, a sign-in link is on its way.` });
      } else {
        await sendPasswordReset(address);
        setMessage({ tone: "success", text: `If ${address} has an account, a reset link is on its way.` });
      }
    } catch (err) {
      const text = err instanceof Error ? err.message : String(err);
      setUnconfirmed(/not confirmed/i.test(text));
      setMessage({ tone: "error", text });
    } finally {
      setBusy(false);
    }
  }

  async function resend() {
    setBusy(true);
    try {
      await resendConfirmation(email.trim());
      setUnconfirmed(false);
      setMessage({ tone: "success", text: `A new confirmation link was sent to ${email.trim()}.` });
    } catch (err) {
      setMessage({ tone: "error", text: err instanceof Error ? err.message : String(err) });
    } finally {
      setBusy(false);
    }
  }

  const titles: Record<Mode, { title: string; description: string; action: string }> = {
    signin: { title: "Sign in", description: "Keep your resumes and point pools in your account.", action: "Sign in" },
    signup: { title: "Create an account", description: "Your resumes sync across browsers and devices.", action: "Create account" },
    magic: { title: "Email me a sign-in link", description: "No password needed; the link signs you in.", action: "Send link" },
    reset: { title: "Reset your password", description: "We'll email you a link to choose a new one.", action: "Send reset link" },
  };
  const copy = titles[mode];

  return (
    <Shell>
      {mode === "signin" || mode === "signup" ? (
        <div className="mb-4 flex w-full rounded-lg bg-wash p-[3px] text-sm">
          {(["signin", "signup"] as const).map((tab) => (
            <button
              key={tab}
              type="button"
              onClick={() => switchMode(tab)}
              className={`flex-1 cursor-pointer rounded-md py-1.5 font-semibold transition-all ${
                mode === tab ? "bg-paper text-ink shadow-sm" : "text-neutral-500 hover:text-ink"
              }`}
            >
              {tab === "signin" ? "Sign in" : "Create account"}
            </button>
          ))}
        </div>
      ) : null}
      <form onSubmit={submit} key={mode}>
        <Card title={copy.title} description={copy.description}>
          <Field label="Email" type="email" value={email} onChange={setEmail} autoComplete="email" autoFocus />
          {mode === "signin" || mode === "signup" ? (
            <Field
              label="Password"
              type="password"
              value={password}
              onChange={setPassword}
              autoComplete={mode === "signup" ? "new-password" : "current-password"}
              placeholder={mode === "signup" ? `At least ${MIN_PASSWORD} characters` : undefined}
            />
          ) : null}
          {message ? <Message tone={message.tone}>{message.text}</Message> : null}
          {unconfirmed ? (
            <button
              type="button"
              disabled={busy}
              onClick={() => void resend()}
              className="cursor-pointer text-xs font-medium underline underline-offset-2"
            >
              Resend confirmation email
            </button>
          ) : null}
          <SubmitButton busy={busy}>{copy.action}</SubmitButton>
          <div className="flex flex-wrap justify-between gap-2 pt-1 text-xs">
            {mode === "signin" ? (
              <>
                <button type="button" className="cursor-pointer text-neutral-500 hover:text-neutral-900" onClick={() => switchMode("magic")}>
                  Email me a link instead
                </button>
                <button type="button" className="cursor-pointer text-neutral-500 hover:text-neutral-900" onClick={() => switchMode("reset")}>
                  Forgot password?
                </button>
              </>
            ) : mode === "signup" ? null : (
              <button type="button" className="cursor-pointer text-neutral-500 hover:text-neutral-900" onClick={() => switchMode("signin")}>
                ← Back to sign in
              </button>
            )}
          </div>
        </Card>
      </form>
      <p className="mt-4 text-center text-xs text-neutral-400">
        Or <a href="#/resume" className="underline-offset-2 hover:text-neutral-700 hover:underline">keep using the builder without an account</a>.
      </p>
    </Shell>
  );
}

// Accounts are only loaded on these pages, not on the job board.
export default function AuthPage() {
  return (
    <AuthProvider>
      <AuthPageInner />
    </AuthProvider>
  );
}
