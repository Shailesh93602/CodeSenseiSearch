/**
 * Vercel serverless entry for the NestJS API.
 *
 * Vercel functions receive native Node `http.IncomingMessage` /
 * `http.ServerResponse` objects. Express handles those directly —
 * no AWS-Lambda-style adapter shim required (the @vendia /
 * serverless-express attempt failed with "Unable to determine event
 * source" precisely because Vercel's request shape isn't a Lambda
 * event). We bootstrap Nest once per cold start, grab the underlying
 * Express instance, cache it across warm invocations, and forward
 * the (req, res) pair to it.
 *
 * Trade-off vs always-on hosting: BullMQ workers don't run here
 * because there's no long-running process. Search / auth / admin
 * HTTP routes work fine — they're synchronous request/response.
 * Ingestion has to be triggered separately (a one-shot run from a
 * laptop against the live DB, or a Vercel cron POSTing to a manual-
 * trigger endpoint). See DEPLOYMENT.md "Step 9 — Seed corpus".
 */

import 'reflect-metadata';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { createApp } from '../src/main';

type ExpressApp = (req: IncomingMessage, res: ServerResponse) => void;

let cachedApp: ExpressApp | undefined;

async function getApp(): Promise<ExpressApp> {
  if (cachedApp) return cachedApp;
  const nest = await createApp();
  await nest.init();
  cachedApp = nest.getHttpAdapter().getInstance() as unknown as ExpressApp;
  return cachedApp;
}

export default async function handler(
  req: IncomingMessage,
  res: ServerResponse,
) {
  const app = await getApp();
  app(req, res);
}
