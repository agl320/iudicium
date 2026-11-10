import type { Session, User } from "@supabase/supabase-js";
import { createContext, useContext } from "react";

export type AuthState = {
  session: Session | null;
  user: User | null;
  // True until the stored session (or an auth code in the URL) is resolved.
  loading: boolean;
  // Arrived from a password-reset email; the account page asks for a new one.
  recovering: boolean;
  finishRecovery: () => void;
};

export const AuthContext = createContext<AuthState | null>(null);

export function useAuth(): AuthState {
  const value = useContext(AuthContext);
  if (!value) throw new Error("useAuth must be used inside <AuthProvider>");
  return value;
}
