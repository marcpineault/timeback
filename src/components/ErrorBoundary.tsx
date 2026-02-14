'use client';

import React, { Component, ErrorInfo, ReactNode } from 'react';
import { analytics } from './Analytics';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null };
  }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    this.setState({ errorInfo });

    // Track error in analytics
    analytics.trackError(
      'react_error_boundary',
      error.message,
      typeof window !== 'undefined' ? window.location.pathname : 'unknown'
    );

    // Log to console for debugging
    console.error('ErrorBoundary caught an error:', error, errorInfo);

    // NOTE: To enable Sentry browser error tracking, install @sentry/browser
    // and uncomment the reportToSentry call below:
    // npm install @sentry/browser
    // this.reportToSentry(error, errorInfo);
  }

  private handleRetry = (): void => {
    this.setState({ hasError: false, error: null, errorInfo: null });
  };

  render(): ReactNode {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <div className="min-h-[400px] flex items-center justify-center p-8">
          <div className="text-center max-w-md">
            <div className="text-6xl mb-4">⚠️</div>
            <h2 className="text-xl font-semibold text-gray-900 mb-2">
              Something went wrong
            </h2>
            <p className="text-[#8a8580] mb-4">
              We encountered an unexpected error. Our team has been notified.
            </p>
            <div className="space-y-2">
              <button
                onClick={this.handleRetry}
                className="px-4 py-2 bg-[#e85d26] text-white rounded-full hover:bg-[#d14d1a] transition-colors"
              >
                Try Again
              </button>
              <button
                onClick={() => window.location.reload()}
                className="block mx-auto text-sm text-[#8a8580] hover:text-[#0a0a0a]"
              >
                Refresh Page
              </button>
            </div>
            {process.env.NODE_ENV === 'development' && this.state.error && (
              <details className="mt-6 text-left">
                <summary className="cursor-pointer text-sm text-[#8a8580]">
                  Error Details (dev only)
                </summary>
                <pre className="mt-2 p-4 bg-[#faf7f2] rounded text-xs overflow-auto max-h-64">
                  {this.state.error.toString()}
                  {this.state.errorInfo?.componentStack}
                </pre>
              </details>
            )}
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

// Hook for function components to report errors
export function useErrorReporter() {
  const reportError = React.useCallback((error: Error, context?: Record<string, unknown>) => {
    // Track in analytics
    analytics.trackError(
      'manual_error_report',
      error.message,
      typeof window !== 'undefined' ? window.location.pathname : 'unknown'
    );

    // Log to console
    console.error('Reported error:', error, context);

    // NOTE: To enable Sentry browser error tracking, install @sentry/browser:
    // npm install @sentry/browser
    // Then add: import * as Sentry from '@sentry/browser'; Sentry.captureException(error, { extra: context });
  }, []);

  return { reportError };
}
