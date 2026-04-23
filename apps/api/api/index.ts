/**
 * Vercel serverless entry for the NestJS API.
 *
 * Vercel discovers files under `api/` as serverless functions. This
 * one bootstraps the same Nest app `main.ts` builds, wraps it with
 * @vendia/serverless-express so AWS-Lambda-style request/response
 * objects from Vercel's runtime get adapted to Express, and caches
 * the handler across warm invocations so we only pay the bootstrap
 * cost on cold starts.
 *
 * Trade-off vs always-on hosting: BullMQ workers don't run here
 * because there's no long-running process to listen on Redis queues.
 * Search / auth / admin HTTP routes work fine — they're synchronous.
 * Ingestion has to be triggered by something else (a Vercel cron, a
 * one-shot run from a laptop against the live DB, or a separate
 * always-on worker host). See DEPLOYMENT.md "Step 9 — Seed corpus".
 */

import 'reflect-metadata';
import serverlessExpress from '@vendia/serverless-express';
import { createApp } from '../src/main';

type SlsHandler = (req: unknown, res: unknown) => Promise<unknown>;

let cachedHandler: SlsHandler | undefined;

async function getHandler(): Promise<SlsHandler> {
  if (cachedHandler) return cachedHandler;
  const app = await createApp();
  await app.init();
  const expressApp = app.getHttpAdapter().getInstance();
  cachedHandler = serverlessExpress({ app: expressApp }) as SlsHandler;
  return cachedHandler;
}

export default async function handler(req: unknown, res: unknown) {
  const h = await getHandler();
  return h(req, res);
}
