import { useState } from "react";
import { Moon, Sun } from "lucide-react";
import { initialTheme, setTheme, type Theme } from "@/lib/theme";
import { cn } from "@/lib/utils";

/**
 * Dark-mode toggle (plan 09, Phase 6). The initial theme follows the OS
 * preference unless the visitor has chosen an override; toggling persists the
 * override. The `.dark` class it sets drives every palette in `index.css`,
 * including the canvas seat colours, so the whole UI re-themes together.
 */
export function ThemeToggle({ className }: { className?: string }) {
  const [theme, setLocalTheme] = useState<Theme>(() => initialTheme());

  const toggle = () => {
    const next: Theme = theme === "dark" ? "light" : "dark";
    setTheme(next);
    setLocalTheme(next);
  };

  const isDark = theme === "dark";
  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={isDark ? "Switch to light theme" : "Switch to dark theme"}
      aria-pressed={isDark}
      className={cn(
        "inline-flex size-9 items-center justify-center rounded-md border bg-card text-card-foreground shadow-sm transition-colors hover:bg-accent focus-visible:outline-none",
        className,
      )}
    >
      {isDark ? (
        <Sun className="size-4" aria-hidden />
      ) : (
        <Moon className="size-4" aria-hidden />
      )}
    </button>
  );
}
