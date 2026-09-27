import type { ReactNode } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "../stores/auth";

interface Props {
  children: ReactNode;
}

/** Gate that bounces unauthenticated users to /login, remembering origin. */
export default function ProtectedRoute({ children }: Props) {
  const isAuthenticated = useAuth((s) => s.isAuthenticated);
  const location = useLocation();

  if (!isAuthenticated) {
    return (
      <Navigate
        to="/login"
        replace
        state={{ from: location.pathname + location.search }}
      />
    );
  }
  return <>{children}</>;
}
