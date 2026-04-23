/**
 * /search page E2E. Stubs the API so tests don't need a running NestJS
 * backend or pgvector — we're testing the UX (typing, filtering,
 * empty state, results render) not the search-quality of the real
 * embeddings.
 *
 * For real backend coverage see the apps/api jest suite.
 */
import { test, expect } from '@playwright/test';

const FAKE_RESPONSE = {
  success: true,
  data: {
    query: 'redlock acquire',
    results: [
      {
        id: 'r1',
        title: 'Redlock acquire — battleRepository.ts',
        description: 'Distributed lock acquired with retryCount: 0',
        source: 'github',
        language: 'typescript',
        url: 'https://github.com/example/repo/blob/main/src/battle.ts#L176',
        author: 'shaileshchaudhary',
        avatar: '',
        stars: 12,
        updatedAt: new Date().toISOString(),
        code: "const lock = await redlock.acquire([resource], ttlMs, { retryCount: 0 });",
        tags: ['redlock', 'distributed-lock'],
      },
      {
        id: 'r2',
        title: 'Lock release in finally',
        description: 'Always release in finally',
        source: 'github',
        language: 'typescript',
        url: 'https://github.com/example/repo/blob/main/src/battle.ts#L180',
        author: 'shaileshchaudhary',
        stars: 12,
        updatedAt: new Date().toISOString(),
        code: 'await lock.release()',
        tags: ['redlock'],
      },
    ],
    totalResults: 2,
    searchTime: 42,
  },
};

test.describe('/search', () => {
  test.beforeEach(async ({ page }) => {
    await page.route('**/search/hybrid', async (route) => {
      await route.fulfill({ json: FAKE_RESPONSE });
    });
    await page.route('**/search/semantic', async (route) => {
      await route.fulfill({ json: FAKE_RESPONSE });
    });
    await page.route('**/search/text', async (route) => {
      await route.fulfill({ json: FAKE_RESPONSE });
    });
    await page.route('**/search/suggestions**', async (route) => {
      await route.fulfill({
        json: { success: true, data: { suggestions: [] } },
      });
    });
  });

  test('renders the search page header + filter affordances', async ({
    page,
  }) => {
    await page.goto('/search');

    await expect(
      page.getByRole('link', { name: /codesensei/i }).first(),
    ).toBeVisible();
    await expect(
      page.getByPlaceholder(/search for code/i),
    ).toBeVisible();
  });

  test('typing a query and pressing Enter renders mocked results', async ({
    page,
  }) => {
    await page.goto('/search');

    const input = page.getByPlaceholder(/search for code/i);
    await input.fill('redlock acquire');
    await input.press('Enter');

    // The first result title from FAKE_RESPONSE should appear.
    await expect(
      page.getByText(/redlock acquire — battleRepository\.ts/i),
    ).toBeVisible({ timeout: 10_000 });
  });

  test('navigating directly to /search?q=redlock auto-runs the query', async ({
    page,
  }) => {
    await page.goto('/search?q=redlock');

    // The qParam should pre-fill the input and trigger results.
    await expect(page.getByPlaceholder(/search for code/i)).toHaveValue(
      'redlock',
    );
  });
});
