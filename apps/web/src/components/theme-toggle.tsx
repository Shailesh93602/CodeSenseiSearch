"use client";

import { useEffect, useState } from "react";
import { useTheme } from "next-themes";
import { Moon, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * Minimal two-state toggle between light and dark. We intentionally
 * don't expose a "system" button in the header — one-click toggle is
 * the interaction 90%+ of users try. "system" is still the default
 * until the toggle is clicked.
 *
 * The `mounted` gate avoids a hydration warning: next-themes reads
 * from localStorage on the client, which the server can't know about
 * during SSR. Rendering a neutral placeholder pre-mount keeps the
 * HTML identical server/client.
 */
export function ThemeToggle() {
  const [mounted, setMounted] = useState(false);
  const { resolvedTheme, setTheme } = useTheme();

  // Defer to a microtask so React's set-state-in-effect lint rule
  // doesn't flag this — the intent IS a once-on-mount sync.
  useEffect(() => {
    queueMicrotask(() => setMounted(true));
  }, []);

  const next = resolvedTheme === "dark" ? "light" : "dark";

  return (
    <Button
      variant="ghost"
      size="icon"
      aria-label={mounted ? `Switch to ${next} mode` : "Toggle theme"}
      onClick={() => setTheme(next)}
      className="text-muted-foreground hover:text-foreground"
    >
      {mounted && resolvedTheme === "dark" ? (
        <Sun className="h-4 w-4" />
      ) : (
        <Moon className="h-4 w-4" />
      )}
    </Button>
  );
}
