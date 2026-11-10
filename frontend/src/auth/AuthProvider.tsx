import type { Session } from "@supabase/supabase-js";
import { type ReactNode, useEffect, useMemo, useState } from "react";
import { RECOVERY_KEY, supabase } from "../lib/supabase";
import { AuthContext } from "./context";

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  // Set by the reset-link handler in lib/supabase.ts; survives page switches.
  const [recovering, setRecovering] = useState(() => sessionStorage.getItem(RECOVERY_KEY) === "1");

  useEffect(() => {
    let active = true;
    supabase.auth.getSession().then(({ data }) => {
      if (!active) return;
      setSession(data.session);
      setLoading(false);
    });
    const { data } = supabase.auth.onAuthStateChange((event, next) => {
      setSession(next);
      setLoading(false);
      if (event === "PASSWORD_RECOVERY") setRecovering(true);
      if (event === "SIGNED_OUT") {
        sessionStorage.removeItem(RECOVERY_KEY);
        setRecovering(false);
      }
    });
    return () => {
      active = false;
      data.subscription.unsubscribe();
    };
  }, []);

  const value = useMemo(
    () => ({
      session,
      user: session?.user ?? null,
      loading,
      recovering,
      finishRecovery: () => {
        sessionStorage.removeItem(RECOVERY_KEY);
        setRecovering(false);
      },
    }),
    [session, loading, recovering],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
