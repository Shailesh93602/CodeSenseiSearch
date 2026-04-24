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
import { BATCH as github010 } from './github-010-tanstack-query';
import { BATCH as github011 } from './github-011-nextjs-app-router';
import { BATCH as github012 } from './github-012-prisma-patterns';
import { BATCH as github013 } from './github-013-bullmq-patterns';
import { BATCH as github014 } from './github-014-zod-typescript';
import { BATCH as github015 } from './github-015-async-patterns';
import { BATCH as github016 } from './github-016-vitest-testing';
import { BATCH as github017 } from './github-017-radix-primitives';
import { BATCH as github018 } from './github-018-tokio-rust';
import { BATCH as github019 } from './github-019-gin-go';
import { BATCH as github020 } from './github-020-fastapi-python';
import { BATCH as github021 } from './github-021-pgvector-postgres';

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
  { name: 'github-010-tanstack-query', items: github010 },
  { name: 'github-011-nextjs-app-router', items: github011 },
  { name: 'github-012-prisma-patterns', items: github012 },
  { name: 'github-013-bullmq-patterns', items: github013 },
  { name: 'github-014-zod-typescript', items: github014 },
  { name: 'github-015-async-patterns', items: github015 },
  { name: 'github-016-vitest-testing', items: github016 },
  { name: 'github-017-radix-primitives', items: github017 },
  { name: 'github-018-tokio-rust', items: github018 },
  { name: 'github-019-gin-go', items: github019 },
  { name: 'github-020-fastapi-python', items: github020 },
  { name: 'github-021-pgvector-postgres', items: github021 },
];

/** Flattened item list for the seed service to iterate. */
export const ALL_BATCH_ITEMS: SeedItem[] = ALL_BATCHES.flatMap((b) => b.items);
