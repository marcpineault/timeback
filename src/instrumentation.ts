export async function register() {
  // Only run on the server
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { logEnvValidation } = await import('./lib/env');
    const { initSentry, captureException } = await import('./lib/sentry');
    const { logger } = await import('./lib/logger');

    // Validate environment variables
    logEnvValidation();

    // Initialize Sentry for error tracking
    await initSentry();

    // Global handler for unhandled promise rejections
    process.on('unhandledRejection', (reason: unknown, promise: Promise<unknown>) => {
      const error = reason instanceof Error ? reason : new Error(String(reason));
      logger.error('Unhandled Promise Rejection', {
        error: error.message,
        stack: error.stack,
        promise: String(promise),
      });
      captureException(error, {
        tags: { type: 'unhandled_rejection' },
        extra: { promise: String(promise) },
      });
    });

    // Global handler for uncaught exceptions
    process.on('uncaughtException', (error: Error, origin: string) => {
      logger.error('Uncaught Exception', {
        error: error.message,
        stack: error.stack,
        origin,
      });
      captureException(error, {
        tags: { type: 'uncaught_exception', origin },
      });

      // Log but don't exit - Next.js handles its own process lifecycle.
      // Calling process.exit() here would kill the server during active
      // requests (uploads, processing), causing user-visible failures.
    });

    // Handle SIGTERM gracefully (for container orchestration)
    process.on('SIGTERM', () => {
      logger.info('SIGTERM received, shutting down gracefully');
      // Allow time for cleanup
      setTimeout(() => {
        process.exit(0);
      }, 5000);
    });

    logger.info('Server instrumentation registered', {
      nodeVersion: process.version,
      env: process.env.NODE_ENV,
    });
  }
}
