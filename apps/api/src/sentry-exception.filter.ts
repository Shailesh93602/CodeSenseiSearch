/**
 * Sentry exception filter.
 *
 * Catches anything that escapes a controller, ships it to Sentry with
 * request metadata attached, then re-throws so Nest's default exception
 * handler still produces the HTTP response. We only capture 5xx /
 * unknown errors — 4xx-class HttpException (BadRequest, Unauthorized,
 * etc.) is the user's problem, not an outage worth paging on.
 */
import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  Logger,
} from '@nestjs/common';
import { BaseExceptionFilter } from '@nestjs/core';
import * as Sentry from '@sentry/node';
import type { Request, Response } from 'express';

@Catch()
export class SentryExceptionFilter
  extends BaseExceptionFilter
  implements ExceptionFilter
{
  private readonly sentryLogger = new Logger(SentryExceptionFilter.name);

  override catch(exception: unknown, host: ArgumentsHost): void {
    if (this.shouldCapture(exception)) {
      this.captureToSentry(exception, host);
    }
    super.catch(exception, host);
  }

  private shouldCapture(exception: unknown): boolean {
    if (!(exception instanceof HttpException)) return true;
    return exception.getStatus() >= 500;
  }

  private captureToSentry(exception: unknown, host: ArgumentsHost): void {
    try {
      const ctx = host.switchToHttp();
      const req = ctx.getRequest<Request>();
      const res = ctx.getResponse<Response>();

      Sentry.withScope((scope) => {
        scope.setTag('http.method', req.method);
        scope.setTag('http.route', req.route?.path ?? req.url);
        scope.setExtra('http.statusCode', res.statusCode);
        scope.setExtra('http.url', req.url);
        if (req.headers['user-agent']) {
          scope.setTag('http.user_agent', String(req.headers['user-agent']));
        }
        Sentry.captureException(exception);
      });
    } catch (sentryErr) {
      // Never let Sentry capture itself bring the app down.
      this.sentryLogger.error('Failed to capture exception to Sentry', sentryErr);
    }
  }
}
