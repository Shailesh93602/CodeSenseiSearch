/**
 * Aggregated corpus across every batch file. The seed service walks
 * this single export rather than scanning the filesystem (which
 * doesn't work at runtime under Vercel's bundled function output).
 *
 * Adding a new batch: drop a `<source>-<NNN>-<topic>.ts` file in
 * this directory exporting `BATCH: SeedItem[]`, then append it to
 * the import list below. That keeps the bundler happy AND keeps the
 * order deterministic.
 */
import type { SeedItem } from '../types';
import { BATCH as github001 } from './github-001-react-hooks';

export const ALL_BATCHES: ReadonlyArray<{ name: string; items: SeedItem[] }> = [
  { name: 'github-001-react-hooks', items: github001 },
];

/** Flattened item list for the seed service to iterate. */
export const ALL_BATCH_ITEMS: SeedItem[] = ALL_BATCHES.flatMap((b) => b.items);
