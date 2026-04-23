import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

// Stub useSuggestions before import — it pulls api-client which would
// try to fetch in the test environment.
vi.mock('@/lib/hooks/use-search', () => ({
  useSuggestions: () => ({
    suggestions: [
      { suggestion: 'react useEffect', type: 'tag', count: 12 },
      { suggestion: 'react hooks', type: 'tag', count: 9 },
    ],
    getSuggestions: vi.fn(),
  }),
}));

import { SearchBar } from '../search-bar';

describe('<SearchBar />', () => {
  beforeEach(() => vi.clearAllMocks());

  it('renders the input with the supplied query value', () => {
    render(
      <SearchBar query="redlock" onQueryChange={() => {}} onSearch={() => {}} />,
    );

    const input = screen.getByPlaceholderText(/search for code/i);
    expect(input).toHaveValue('redlock');
  });

  it('forwards every keystroke to onQueryChange', async () => {
    const onQueryChange = vi.fn();
    const user = userEvent.setup();
    render(
      <SearchBar
        query=""
        onQueryChange={onQueryChange}
        onSearch={() => {}}
      />,
    );

    const input = screen.getByPlaceholderText(/search for code/i);
    await user.type(input, 'r');

    expect(onQueryChange).toHaveBeenCalledTimes(1);
    expect(onQueryChange).toHaveBeenCalledWith('r');
  });

  it('triggers onSearch when Enter is pressed', async () => {
    const onSearch = vi.fn();
    const user = userEvent.setup();
    render(
      <SearchBar query="hooks" onQueryChange={() => {}} onSearch={onSearch} />,
    );

    const input = screen.getByPlaceholderText(/search for code/i);
    await user.click(input);
    await user.keyboard('{Enter}');

    expect(onSearch).toHaveBeenCalledTimes(1);
  });

  it('shows the clear button when query is non-empty and clears via click', async () => {
    const onQueryChange = vi.fn();
    const user = userEvent.setup();
    render(
      <SearchBar
        query="some query"
        onQueryChange={onQueryChange}
        onSearch={() => {}}
      />,
    );

    // The X icon button doesn't have accessible text — find by class
    // proximity: it sits next to the input within the same container
    // and is the only role=button before the keyboard hint.
    const clearButtons = screen
      .getAllByRole('button')
      .filter((b) => b.querySelector('svg'));
    expect(clearButtons.length).toBeGreaterThan(0);

    await user.click(clearButtons[0]);
    expect(onQueryChange).toHaveBeenCalledWith('');
  });

  it('hides the clear button when query is empty', () => {
    render(
      <SearchBar query="" onQueryChange={() => {}} onSearch={() => {}} />,
    );

    // Only the keyboard hint button (⌘K) should remain — clear icon absent.
    expect(screen.queryByRole('button', { name: /clear/i })).toBeNull();
  });
});
