import { useEffect } from "react";
import {
  BrowserRouter,
  Routes,
  Route,
  Navigate,
  useLocation,
} from "react-router-dom";
import { useAuth } from "./stores/auth";
import { UNAUTHORIZED_EVENT } from "./lib/api";
import ProtectedRoute from "./components/ProtectedRoute";
import Layout from "./components/Layout";
import Login from "./pages/Login";
import Dashboard from "./pages/Dashboard";
import Chat from "./pages/Chat";
import Resume from "./pages/Resume";
import Upload from "./pages/Upload";
import Projects from "./pages/Projects";
import Skills from "./pages/Skills";
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
        <Route
          element={
            <ProtectedRoute>
              <Layout />
            </ProtectedRoute>
          }
        >
          <Route index element={<Dashboard />} />
          <Route path="chat" element={<Chat />} />
          <Route path="resume" element={<Resume />} />
          <Route path="upload" element={<Upload />} />
          <Route path="projects" element={<Projects />} />
          <Route path="skills" element={<Skills />} />
          <Route path="sessions" element={<Sessions />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
