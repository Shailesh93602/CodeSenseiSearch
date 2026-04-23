import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { CTA } from '../cta';

describe('<CTA />', () => {
  it('renders the headline + sub-copy', () => {
    render(<CTA />);

    expect(
      screen.getByRole('heading', {
        name: /supercharge your development workflow/i,
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/early access/i, { selector: 'p' }),
    ).toBeInTheDocument();
  });

  it('renders an email input + Get Early Access button', () => {
    render(<CTA />);

    const email = screen.getByPlaceholderText(/enter your email/i);
    expect(email).toBeInTheDocument();
    expect(email).toHaveAttribute('type', 'email');

    expect(
      screen.getByRole('button', { name: /get early access/i }),
    ).toBeInTheDocument();
  });

  it('shows the four social-proof stat cards', () => {
    render(<CTA />);

    expect(screen.getByText('1000+')).toBeInTheDocument();
    expect(screen.getByText(/developers waiting/i)).toBeInTheDocument();

    expect(screen.getByText('99.9%')).toBeInTheDocument();
    expect(screen.getByText(/uptime SLA/i)).toBeInTheDocument();

    expect(screen.getByText('24/7')).toBeInTheDocument();
    expect(screen.getByText(/free/i)).toBeInTheDocument();
  });

  it('shows the "no spam" reassurance copy under the form', () => {
    render(<CTA />);
    expect(screen.getByText(/no spam/i)).toBeInTheDocument();
  });
});
