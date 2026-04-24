/**
 * Aggregated corpus across every batch file. The seed service walks
 * this single export rather than scanning the filesystem (which
 * doesn't work at runtime under Vercel's bundled function output).
 *
 * Adding a new batch: drop a `<source>-<NNN>-<topic>.ts` file in
 * this directory exporting `BATCH: SeedItem[]`, then append it to
 * the import + array below.
 */
import type { SeedItem } from '../types';
import { BATCH as github001 } from './github-001-react-hooks';
import { BATCH as github002 } from './github-002-khatago-patterns';
import { BATCH as github003 } from './github-003-eduscale-patterns';
import { BATCH as github004 } from './github-004-devtrack-patterns';
import { BATCH as github005 } from './github-005-careerglyph-patterns';
import { BATCH as github006 } from './github-006-redis-battle';
import { BATCH as github007 } from './github-007-stripe-payments';
import { BATCH as github008 } from './github-008-razorpay-patterns';
import { BATCH as github009 } from './github-009-portfolio-next';

export const ALL_BATCHES: ReadonlyArray<{ name: string; items: SeedItem[] }> = [
  { name: 'github-001-react-hooks', items: github001 },
  { name: 'github-002-khatago-patterns', items: github002 },
  { name: 'github-003-eduscale-patterns', items: github003 },
  { name: 'github-004-devtrack-patterns', items: github004 },
  { name: 'github-005-careerglyph-patterns', items: github005 },
  { name: 'github-006-redis-battle', items: github006 },
  { name: 'github-007-stripe-payments', items: github007 },
  { name: 'github-008-razorpay-patterns', items: github008 },
  { name: 'github-009-portfolio-next', items: github009 },
];

/** Flattened item list for the seed service to iterate. */
export const ALL_BATCH_ITEMS: SeedItem[] = ALL_BATCHES.flatMap((b) => b.items);
