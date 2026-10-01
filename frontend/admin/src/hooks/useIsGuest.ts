import { useAuth } from "../stores/auth";

/** True when the current session is a read-only guest session. */
export function useIsGuest(): boolean {
  return useAuth((s) => s.isGuest);
}
