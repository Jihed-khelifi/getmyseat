import { useCallback, useState } from "react";
import { ThemeToggle } from "@/components/seat-map/ThemeToggle";
import { clearAdminToken, getAdminToken, setAdminToken } from "./admin-session";
import { AdminLogin } from "./AdminLogin";
import { AdminDashboard } from "./AdminDashboard";

/**
 * `/admin` page shell (plan 10, Phase 5). Holds the bearer token in tab-scoped
 * session storage and swaps between the login form and the dashboard. Kept in a
 * lazy-loaded route (see `main.tsx`) so it never weighs down the seat-map bundle.
 */
export default function AdminPage() {
  const [token, setToken] = useState<string | null>(() => getAdminToken());

  const authenticate = useCallback((next: string) => {
    setAdminToken(next);
    setToken(next);
  }, []);

  const signOut = useCallback(() => {
    clearAdminToken();
    setToken(null);
  }, []);

  return (
    <div className="min-h-full">
      <header className="flex items-center justify-between border-b px-4 py-3">
        <h1 className="text-lg font-semibold">
          GetMySeat <span className="text-muted-foreground">/ admin</span>
        </h1>
        <ThemeToggle />
      </header>
      {token ? (
        <AdminDashboard
          token={token}
          onSignOut={signOut}
          onUnauthorized={signOut}
        />
      ) : (
        <AdminLogin onAuthenticated={authenticate} />
      )}
    </div>
  );
}
