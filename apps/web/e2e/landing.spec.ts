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
      page.getByRole('heading', { name: /built for developers/i }).first(),
    ).toBeVisible();

    // CTA at the bottom
    await expect(
      page.getByRole('button', { name: /get early access/i }),
    ).toBeVisible();

    // Reasonable noise tolerance — Next dev server emits a few internal
    // warnings; flag only hard application errors.
    const appErrors = consoleErrors.filter(
      (e) => !e.includes('Download the React DevTools'),
    );
    expect(appErrors).toEqual([]);
  });

  test('clicking the search CTA in the hero navigates to /search', async ({
    page,
  }) => {
    await page.goto('/');

    // The hero exposes a "Try search" / "Search now" / similar button
    // that links to /search. Click whichever matches and assert URL.
    const searchLink = page
      .getByRole('link')
      .or(page.getByRole('button'))
      .filter({ hasText: /search|try it|get started/i })
      .first();

    await searchLink.click();

    await expect(page).toHaveURL(/\/search/);
  });
});
