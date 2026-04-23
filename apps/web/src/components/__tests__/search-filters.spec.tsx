import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SearchFilters } from '../search-filters';

const baseFilters = {
  source: 'all',
  language: 'all',
  sortBy: 'relevance',
  dateRange: 'all',
};

describe('<SearchFilters />', () => {
  it('hides "Clear all" when nothing is filtered', () => {
    render(<SearchFilters filters={baseFilters} onFiltersChange={() => {}} />);

    expect(
      screen.queryByRole('button', { name: /clear all/i }),
    ).not.toBeInTheDocument();
  });

  it('shows "Clear all" once any filter is non-default', () => {
    render(
      <SearchFilters
        filters={{ ...baseFilters, source: 'github' }}
        onFiltersChange={() => {}}
      />,
    );

    expect(
      screen.getByRole('button', { name: /clear all/i }),
    ).toBeInTheDocument();
  });

  it('emits the new filter object when a source button is clicked', async () => {
    const onFiltersChange = vi.fn();
    const user = userEvent.setup();
    render(
      <SearchFilters filters={baseFilters} onFiltersChange={onFiltersChange} />,
    );

    await user.click(screen.getByRole('button', { name: /github/i }));

    expect(onFiltersChange).toHaveBeenCalledWith({
      ...baseFilters,
      source: 'github',
    });
  });

  it('"Clear all" resets every filter back to the default constants', async () => {
    const onFiltersChange = vi.fn();
    const user = userEvent.setup();
    render(
      <SearchFilters
        filters={{
          source: 'github',
          language: 'typescript',
          sortBy: 'stars',
          dateRange: 'week',
        }}
        onFiltersChange={onFiltersChange}
      />,
    );

    await user.click(screen.getByRole('button', { name: /clear all/i }));

    expect(onFiltersChange).toHaveBeenCalledWith({
      source: 'all',
      language: 'all',
      sortBy: 'relevance',
      dateRange: 'all',
    });
  });

  it('marks the active source with an "Active" badge', () => {
    render(
      <SearchFilters
        filters={{ ...baseFilters, source: 'stackoverflow' }}
        onFiltersChange={() => {}}
      />,
    );

    // "Active" badge should sit next to Stack Overflow, not GitHub.
    const stackOverflowButton = screen
      .getByRole('button', { name: /stack overflow/i });
    expect(stackOverflowButton).toHaveTextContent(/active/i);

    const githubButton = screen.getByRole('button', { name: /^github/i });
    expect(githubButton).not.toHaveTextContent(/active/i);
  });
});
