// Sentry error tracking utilities
// Server-side Sentry integration
//
// To enable Sentry error tracking:
// 1. Install the package: npm install @sentry/node
// 2. Set environment variable: SENTRY_DSN=your-dsn-here
// 3. The integration will automatically initialize on server startup

import { logger } from './logger';

const SENTRY_DSN = process.env.SENTRY_DSN || process.env.NEXT_PUBLIC_SENTRY_DSN;

interface SentryBreadcrumb {
  category: string;
  message: string;
  level: 'debug' | 'info' | 'warning' | 'error';
  data?: Record<string, unknown>;
}

interface SentryContext {
  user?: {
    id: string;
    email?: string;
  };
  tags?: Record<string, string>;
  extra?: Record<string, unknown>;
}

// In-memory breadcrumb buffer for debugging even without Sentry
const breadcrumbBuffer: SentryBreadcrumb[] = [];
const MAX_BREADCRUMBS = 100;

let sentryInitialized = false;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let SentryModule: any = null;

// Module name constructed at runtime to avoid static analysis
const SENTRY_MODULE_NAME = ['@sentry', 'node'].join('/');

/**
 * Initialize Sentry on the server side
 * This should be called once during app startup
 */
export async function initSentry(): Promise<void> {
  if (sentryInitialized) {
    return;
  }

  if (!SENTRY_DSN) {
    logger.info('[Sentry] No DSN configured. Set SENTRY_DSN env var to enable error tracking.');
    return;
  }

  try {
    // Dynamic import using runtime-constructed module name
    // This prevents build-time resolution errors when @sentry/node isn't installed
    SentryModule = await (Function('moduleName', 'return import(moduleName)')(SENTRY_MODULE_NAME));

    if (!SentryModule) {
      logger.info('[Sentry] @sentry/node not installed. Run: npm install @sentry/node');
      return;
    }

    SentryModule.init({
      dsn: SENTRY_DSN,
      environment: process.env.NODE_ENV || 'development',
      release: process.env.NEXT_PUBLIC_APP_VERSION || 'unknown',
      tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 1.0,
      ignoreErrors: [
        'ECONNRESET',
        'ECONNREFUSED',
        'ETIMEDOUT',
        'ENOTFOUND',
        'UNAUTHENTICATED',
        'ENOENT',
      ],
    });

    sentryInitialized = true;
    logger.info('[Sentry] Initialized successfully');
  } catch (error) {
    logger.info('[Sentry] @sentry/node not installed. Run: npm install @sentry/node');
  }
}

/**
 * Capture an exception and send to Sentry
 */
export function captureException(
  error: Error | unknown,
  context?: SentryContext
): string | undefined {
  const errorObj = error instanceof Error ? error : new Error(String(error));

  // Always log locally
  logger.error('[Error]', {
    message: errorObj.message,
    stack: errorObj.stack,
    ...context?.extra,
  });

  if (!SentryModule || !SENTRY_DSN) {
    return undefined;
  }

  try {
    return SentryModule.captureException(errorObj, {
      user: context?.user,
      tags: context?.tags,
      extra: context?.extra,
    });
  } catch {
    return undefined;
  }
}

/**
 * Capture a message (non-error event)
 */
export function captureMessage(
  message: string,
  level: 'info' | 'warning' | 'error' = 'info',
  context?: SentryContext
): string | undefined {
  logger.info(`[${level.toUpperCase()}] ${message}`, context?.extra);

  if (!SentryModule || !SENTRY_DSN) {
    return undefined;
  }

  try {
    return SentryModule.captureMessage(message, {
      level,
      user: context?.user,
      tags: context?.tags,
      extra: context?.extra,
    });
  } catch {
    return undefined;
  }
}

/**
 * Add a breadcrumb for debugging context
 */
export function addBreadcrumb(breadcrumb: SentryBreadcrumb): void {
  // Always store locally
  breadcrumbBuffer.push(breadcrumb);
  if (breadcrumbBuffer.length > MAX_BREADCRUMBS) {
    breadcrumbBuffer.shift();
  }

  if (SentryModule) {
    try {
      SentryModule.addBreadcrumb({
        category: breadcrumb.category,
        message: breadcrumb.message,
        level: breadcrumb.level,
        data: breadcrumb.data,
      });
    } catch {
      // Ignore errors
    }
  }
}

/**
 * Set user context for error tracking
 */
export function setUser(user: { id: string; email?: string } | null): void {
  if (SentryModule) {
    try {
      SentryModule.setUser(user);
    } catch {
      // Ignore errors
    }
  }
}

/**
 * Set a tag that will be attached to all events
 */
export function setTag(key: string, value: string): void {
  if (SentryModule) {
    try {
      SentryModule.setTag(key, value);
    } catch {
      // Ignore errors
    }
  }
}

/**
 * Create a wrapped function that automatically reports errors
 */
export function withErrorTracking<T extends (...args: unknown[]) => unknown>(
  fn: T,
  context?: { name: string; tags?: Record<string, string> }
): T {
  return ((...args: Parameters<T>) => {
    try {
      const result = fn(...args);

      // Handle async functions
      if (result instanceof Promise) {
        return result.catch((error) => {
          captureException(error, {
            tags: { function_name: context?.name || fn.name, ...context?.tags },
            extra: { arguments: args },
          });
          throw error;
        });
      }

      return result;
    } catch (error) {
      captureException(error, {
        tags: { function_name: context?.name || fn.name, ...context?.tags },
        extra: { arguments: args },
      });
      throw error;
    }
  }) as T;
}

/**
 * Start a performance transaction
 */
export function startTransaction(
  name: string,
  op: string
): { finish: () => void } {
  if (SentryModule) {
    try {
      const span = SentryModule.startInactiveSpan({ name, op });
      if (span) {
        return span;
      }
    } catch {
      // Fall through to default
    }
  }

  const start = Date.now();
  return {
    finish: () => {
      logger.debug(`[Perf] ${name} (${op}): ${Date.now() - start}ms`);
    },
  };
}

// Export buffer for debugging
export function getBreadcrumbs(): SentryBreadcrumb[] {
  return [...breadcrumbBuffer];
}
