/**
 * Landing-page smoke tests. The Hero, Features, and CTA sections are
 * the "first 5 seconds" recruiter view — if any of them fails to
 * render, that's a blocker for any other E2E.
 */
import { test, expect } from '@playwright/test';

test.describe('Landing page', () => {
  test('renders Hero, Features, and CTA without console errors', async ({
    page,
  }) => {
    const consoleErrors: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') consoleErrors.push(msg.text());
    });

    await page.goto('/');

    // Hero
    await expect(
      page.getByRole('heading', { level: 1 }),
    ).toBeVisible();

    // Features section heading
    await expect(
      page
        .getByRole('heading', { name: /everything you need to find code faster/i })
        .first(),
    ).toBeVisible();

    // CTA at the bottom
    await expect(
      page.getByRole('button', { name: /get early access/i }),
    ).toBeVisible();

    // Reasonable noise tolerance — Next dev server emits CSP/CSS warnings
    // and the React DevTools hint that aren't application bugs. Flag
    // only hard errors that would actually affect the user.
    const appErrors = consoleErrors.filter((e) => {
      if (e.includes('Download the React DevTools')) return false;
      if (e.includes('Content-Security-Policy')) return false;
      // Dev-mode CSS chunks 404 transiently as Turbopack rebuilds — ignore.
      if (e.includes('globals.css') || e.includes('MIME type')) return false;
      if (e.includes('Failed to load resource')) return false;
      return true;
    });
    expect(appErrors).toEqual([]);
  });

  test('clicking the search CTA in the hero navigates to /search', async ({
    page,
  }) => {
    await page.goto('/');

    // Hero contains an embedded search input that submits to /search?q=...
    // Use it as the navigation path — typing then Enter is the
    // closest-to-real-user gesture.
    const heroInput = page.getByPlaceholder(/search for react hooks/i);
    await heroInput.fill('redlock');
    await heroInput.press('Enter');

    await expect(page).toHaveURL(/\/search/);
  });
});
