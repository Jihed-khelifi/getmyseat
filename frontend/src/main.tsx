import { StrictMode, lazy, Suspense } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";
import { applyTheme, initialTheme } from "./lib/theme";

// Apply the persisted/OS theme before first paint to avoid a flash (plan 09).
applyTheme(initialTheme());

const rootElement = document.getElementById("root");
if (!rootElement) {
  throw new Error('Root element "#root" not found.');
}

// Minimal path-based routing (plan 10): the operator-facing `/admin` page is
// lazy-loaded so it stays out of the seat-map bundle (no router dependency for a
// two-route app). Everything else renders the seating app.
const AdminPage = lazy(() => import("./features/admin/AdminPage"));
const isAdminRoute = window.location.pathname.replace(/\/$/, "") === "/admin";

createRoot(rootElement).render(
  <StrictMode>
    {isAdminRoute ? (
      <Suspense
        fallback={
          <p className="p-4 text-sm text-muted-foreground">Loading admin…</p>
        }
      >
        <AdminPage />
      </Suspense>
    ) : (
      <App />
    )}
  </StrictMode>,
);
