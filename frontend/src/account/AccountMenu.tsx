import type { User } from "@supabase/supabase-js";
import { signOut } from "../resume/cloud";
import { Popover } from "../resume/Popover";

function initial(user: User): string {
  return (user.email ?? "?").charAt(0).toUpperCase();
}

export function AccountMenu({ user, beforeSignOut }: { user: User; beforeSignOut?: () => Promise<boolean> }) {
  return (
    <Popover
      align="right"
      width="w-60"
      trigger={(open) => (
        <button
          type="button"
          aria-label="Account"
          className={`flex size-8 cursor-pointer items-center justify-center rounded-lg text-xs font-semibold transition-all ${
            open ? "bg-neutral-900 text-white ring-4 ring-neutral-200" : "bg-neutral-800 text-white hover:ring-4 hover:ring-neutral-200"
          }`}
        >
          {initial(user)}
        </button>
      )}
    >
      {(close) => (
        <div className="text-sm">
          <div className="px-2.5 py-2">
            <p className="font-mono text-[10px] uppercase tracking-widest text-neutral-400">Signed in as</p>
            <p className="truncate text-neutral-800">{user.email}</p>
          </div>
          <div className="border-t border-neutral-100 pt-1">
            <a
              href="#/account"
              onClick={close}
              className="block rounded-lg px-2.5 py-1.5 text-neutral-700 transition-colors hover:bg-neutral-50"
            >
              Account settings
            </a>
            <a
              href="#/"
              onClick={close}
              className="block rounded-lg px-2.5 py-1.5 text-neutral-700 transition-colors hover:bg-neutral-50"
            >
              Job board
            </a>
            <button
              type="button"
              className="block w-full cursor-pointer rounded-lg px-2.5 py-1.5 text-left text-neutral-700 transition-colors hover:bg-neutral-50"
              onClick={() => {
                close();
                void (async () => {
                  // Save the last edits first; signing out ends write access.
                  if (beforeSignOut && !(await beforeSignOut()) && !confirm("Some changes could not be saved. Sign out anyway?")) return;
                  try {
                    await signOut();
                  } catch (err) {
                    alert(err instanceof Error ? err.message : String(err));
                  }
                })();
              }}
            >
              Sign out
            </button>
          </div>
        </div>
      )}
    </Popover>
  );
}
