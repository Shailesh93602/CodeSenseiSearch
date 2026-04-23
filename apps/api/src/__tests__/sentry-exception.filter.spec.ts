/**
 * Tests for SentryExceptionFilter.
 *
 * The filter wraps Nest's BaseExceptionFilter — we don't want to test
 * Nest's HTTP response shaping here, only the capture-to-Sentry
 * decision and the metadata that gets attached.
 */
import {
  ArgumentsHost,
  BadRequestException,
  HttpException,
  HttpStatus,
  InternalServerErrorException,
} from '@nestjs/common';

// Mock @sentry/node before importing the filter so the captures
// land on jest mocks instead of attempting to send to a real DSN.
jest.mock('@sentry/node', () => ({
  withScope: jest.fn((cb) =>
    cb({
      setTag: jest.fn(),
      setExtra: jest.fn(),
    }),
  ),
  captureException: jest.fn(),
}));

import * as Sentry from '@sentry/node';
import { SentryExceptionFilter } from '../sentry-exception.filter';

function makeHost(req: Partial<Request> = {}, res: any = { statusCode: 500 }): ArgumentsHost {
  return {
    switchToHttp: () => ({
      getRequest: () => ({ method: 'GET', url: '/x', headers: {}, route: { path: '/x' }, ...req }),
      getResponse: () => res,
      getNext: () => () => undefined,
    }),
    getArgByIndex: () => undefined,
    getArgs: () => [],
    getType: () => 'http',
    switchToRpc: () => null as any,
    switchToWs: () => null as any,
  } as unknown as ArgumentsHost;
}

describe('SentryExceptionFilter', () => {
  let filter: SentryExceptionFilter;

  beforeEach(() => {
    jest.clearAllMocks();
    filter = new SentryExceptionFilter();
    // Stub the parent BaseExceptionFilter.catch to a no-op so we don't
    // depend on Nest's HTTP adapter being wired in unit tests.
    jest
      .spyOn(Object.getPrototypeOf(Object.getPrototypeOf(filter)), 'catch')
      .mockImplementation(() => undefined);
  });

  it('captures unknown (non-HttpException) errors', () => {
    filter.catch(new Error('database is on fire'), makeHost());
    expect(Sentry.captureException).toHaveBeenCalledTimes(1);
    expect(Sentry.captureException).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'database is on fire' }),
    );
  });

  it('captures 5xx HttpException', () => {
    filter.catch(new InternalServerErrorException('upstream down'), makeHost());
    expect(Sentry.captureException).toHaveBeenCalledTimes(1);
  });

  it('does NOT capture 4xx HttpException (user error, not an outage)', () => {
    filter.catch(new BadRequestException('email required'), makeHost());
    expect(Sentry.captureException).not.toHaveBeenCalled();
  });

  it('does NOT capture 401', () => {
    const err = new HttpException('unauthorized', HttpStatus.UNAUTHORIZED);
    filter.catch(err, makeHost());
    expect(Sentry.captureException).not.toHaveBeenCalled();
  });

  it('attaches request metadata via withScope', () => {
    filter.catch(
      new Error('boom'),
      makeHost(
        { method: 'POST', url: '/api/contact', headers: { 'user-agent': 'curl/8' }, route: { path: '/api/contact' } } as any,
        { statusCode: 500 },
      ),
    );
    expect(Sentry.withScope).toHaveBeenCalledTimes(1);
  });
});
