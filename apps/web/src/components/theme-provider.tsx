"use client";

import { ThemeProvider as NextThemesProvider } from "next-themes";
import type { ComponentProps } from "react";

/**
 * App-wide theme provider. We pin attribute="class" so the dark
 * variant in globals.css (`@variant dark`) matches what next-themes
 * sets on <html>. defaultTheme="system" respects OS preference until
 * the user clicks the toggle.
 */
export function ThemeProvider(props: ComponentProps<typeof NextThemesProvider>) {
  return (
    <NextThemesProvider
      attribute="class"
      defaultTheme="system"
      enableSystem
      disableTransitionOnChange
      {...props}
    />
  );
}
