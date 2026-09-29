import { useEffect } from "react";
import { BrowserRouter, Routes, Route, Navigate, useLocation } from "react-router-dom";
import { useAuth } from "./stores/auth";
import { UNAUTHORIZED_EVENT } from "./lib/api";
import ProtectedRoute from "./components/ProtectedRoute";
import Layout from "./components/Layout";
import Login from "./pages/Login";
import GithubCallback from "./pages/GithubCallback";
import Dashboard from "./pages/Dashboard";
import Chat from "./pages/Chat";
import Sessions from "./pages/Sessions";

/** Keep the auth store in sync when the API layer detects a 401. */
function useUnauthorizedSync() {
  const logout = useAuth((s) => s.logout);
  useEffect(() => {
    const handler = () => logout();
    window.addEventListener(UNAUTHORIZED_EVENT, handler);
    return () => window.removeEventListener(UNAUTHORIZED_EVENT, handler);
  }, [logout]);
}

/** Redirect authenticated users away from /login. */
function LoginRoute() {
  const authed = useAuth((s) => s.isAuthenticated);
  const location = useLocation();
  if (authed) {
    const to = (location.state as { from?: string } | null)?.from ?? "/chat";
    return <Navigate to={to} replace />;
  }
  return <Login />;
}

export default function App() {
  const hydrate = useAuth((s) => s.hydrate);
  useEffect(() => {
    hydrate();
  }, [hydrate]);
  useUnauthorizedSync();

  return (
    <BrowserRouter basename="/admin">
      <Routes>
        <Route path="/login" element={<LoginRoute />} />
        {/* OAuth callback: outside the layout (no auth requirement — the
            backend already authenticated the exchange). */}
        <Route path="github-callback" element={<GithubCallback />} />
        <Route
          element={
            <ProtectedRoute>
              <Layout />
            </ProtectedRoute>
          }
        >
          <Route index element={<Dashboard />} />
          <Route path="chat" element={<Chat />} />
          <Route path="sessions" element={<Sessions />} />
          {/* Legacy form pages removed — redirect to the agent chat workbench. */}
          <Route path="resume" element={<Navigate to="/chat" replace />} />
          <Route path="upload" element={<Navigate to="/chat" replace />} />
          <Route path="projects" element={<Navigate to="/chat" replace />} />
          <Route path="skills" element={<Navigate to="/chat" replace />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
