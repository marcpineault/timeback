'use client';

import Script from 'next/script';

const GA_MEASUREMENT_ID = process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID;

export function GoogleAnalytics() {
  if (!GA_MEASUREMENT_ID) {
    return null;
  }

  return (
    <>
      <Script
        src={`https://www.googletagmanager.com/gtag/js?id=${GA_MEASUREMENT_ID}`}
        strategy="afterInteractive"
      />
      <Script id="google-analytics" strategy="afterInteractive">
        {`
          window.dataLayer = window.dataLayer || [];
          function gtag(){dataLayer.push(arguments);}
          gtag('js', new Date());
          gtag('config', '${GA_MEASUREMENT_ID}', {
            page_path: window.location.pathname,
          });
        `}
      </Script>
    </>
  );
}

// Analytics event types for type safety
type AnalyticsEventParams = {
  // Conversion events
  sign_up: { method?: string };
  login: { method?: string };

  // Video events
  video_upload_started: { file_count: number; total_size_mb: number };
  video_upload_completed: { file_count: number; duration_seconds: number };
  video_upload_failed: { error: string };
  video_process_started: { video_count: number; settings: string };
  video_process_completed: { video_count: number; duration_seconds: number };
  video_process_failed: { error: string };
  video_download_started: { format: string };
  video_download_completed: { format: string };

  // Subscription events
  subscription_started: { plan: string; price: number };
  subscription_upgraded: { from_plan: string; to_plan: string };
  subscription_cancelled: { plan: string; reason?: string };

  // Feature usage
  feature_used: { feature_name: string; details?: string };
  preset_selected: { preset_name: string };

  // Engagement
  page_view: { page_path: string; page_title?: string };
  button_click: { button_name: string; location: string };

  // Errors
  error_occurred: { error_type: string; error_message: string; page: string };
};

type AnalyticsEvent = keyof AnalyticsEventParams;

declare global {
  interface Window {
    gtag?: (
      command: 'event' | 'config' | 'js',
      targetId: string | Date,
      config?: Record<string, unknown>
    ) => void;
    dataLayer?: unknown[];
  }
}

export function trackEvent<T extends AnalyticsEvent>(
  eventName: T,
  params: AnalyticsEventParams[T]
): void {
  if (typeof window === 'undefined' || !window.gtag || !GA_MEASUREMENT_ID) {
    return;
  }

  try {
    window.gtag('event', eventName, params);
  } catch (error) {
    console.error('Analytics tracking error:', error);
  }
}

// Convenience functions for common events
export const analytics = {
  // User events
  trackSignUp: (method = 'email') => trackEvent('sign_up', { method }),
  trackLogin: (method = 'email') => trackEvent('login', { method }),

  // Video events
  trackUploadStarted: (fileCount: number, totalSizeMb: number) =>
    trackEvent('video_upload_started', { file_count: fileCount, total_size_mb: totalSizeMb }),
  trackUploadCompleted: (fileCount: number, durationSeconds: number) =>
    trackEvent('video_upload_completed', { file_count: fileCount, duration_seconds: durationSeconds }),
  trackUploadFailed: (error: string) =>
    trackEvent('video_upload_failed', { error }),
  trackProcessStarted: (videoCount: number, settings: string) =>
    trackEvent('video_process_started', { video_count: videoCount, settings }),
  trackProcessCompleted: (videoCount: number, durationSeconds: number) =>
    trackEvent('video_process_completed', { video_count: videoCount, duration_seconds: durationSeconds }),
  trackProcessFailed: (error: string) =>
    trackEvent('video_process_failed', { error }),
  trackDownloadStarted: (format: string) =>
    trackEvent('video_download_started', { format }),
  trackDownloadCompleted: (format: string) =>
    trackEvent('video_download_completed', { format }),

  // Subscription events
  trackSubscriptionStarted: (plan: string, price: number) =>
    trackEvent('subscription_started', { plan, price }),
  trackSubscriptionUpgraded: (fromPlan: string, toPlan: string) =>
    trackEvent('subscription_upgraded', { from_plan: fromPlan, to_plan: toPlan }),
  trackSubscriptionCancelled: (plan: string, reason?: string) =>
    trackEvent('subscription_cancelled', { plan, reason }),

  // Feature usage
  trackFeatureUsed: (featureName: string, details?: string) =>
    trackEvent('feature_used', { feature_name: featureName, details }),
  trackPresetSelected: (presetName: string) =>
    trackEvent('preset_selected', { preset_name: presetName }),

  // Engagement
  trackPageView: (pagePath: string, pageTitle?: string) =>
    trackEvent('page_view', { page_path: pagePath, page_title: pageTitle }),
  trackButtonClick: (buttonName: string, location: string) =>
    trackEvent('button_click', { button_name: buttonName, location }),

  // Errors
  trackError: (errorType: string, errorMessage: string, page: string) =>
    trackEvent('error_occurred', { error_type: errorType, error_message: errorMessage, page }),
};
