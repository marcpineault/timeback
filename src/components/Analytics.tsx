'use client';

import Script from 'next/script';

// NEXT_PUBLIC_* env vars are replaced at build time. When building on Railway
// without .env present, the value is baked in as undefined.  To work around
// this, the server-side layout passes the measurement ID as a prop at runtime.
// We also store it in a module-level variable so trackEvent() can use it.
let runtimeGaId: string | undefined;

export function GoogleAnalytics({ gaId }: { gaId?: string }) {
  if (gaId) {
    runtimeGaId = gaId;
  }

  if (!gaId) {
    return null;
  }

  return (
    <>
      <Script
        src={`https://www.googletagmanager.com/gtag/js?id=${gaId}`}
        strategy="afterInteractive"
      />
      <Script id="google-analytics" strategy="afterInteractive">
        {`
          window.dataLayer = window.dataLayer || [];
          function gtag(){dataLayer.push(arguments);}
          gtag('js', new Date());
          gtag('config', '${gaId}', {
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

  // Vertical onboarding events
  vertical_onboarding_started: Record<string, never>;
  vertical_selected: { vertical: string };
  vertical_onboarding_completed: { vertical: string; market?: string; specialization?: string };

  // Script template events
  script_template_viewed: { template_id: string };
  script_template_copied: { template_id: string };
  script_template_saved_to_scripts: { template_id: string };
  script_template_opened_in_teleprompter: { template_id: string };

  // Content calendar events
  content_calendar_viewed: { month: number };
  content_calendar_script_clicked: { entry_id: string; category: string };

  // Dashboard suggestion events
  dashboard_suggestion_clicked: { suggestion_type: string; category?: string };

  // Upgrade/conversion events
  upgrade_prompt_shown: {
    prompt_type: string;    // 'banner' | 'modal' | 'nav_pill'
    context: string;        // 'usage_warning' | 'watermark' | 'resolution' | 'limit_reached' | 'general'
    current_plan: string;
    location: string;       // 'dashboard' | 'ideate' | 'editor' | 'nav'
  };
  upgrade_prompt_clicked: {
    prompt_type: string;
    context: string;
    current_plan: string;
    target_plan: string;
    location: string;
  };
  upgrade_prompt_dismissed: {
    prompt_type: string;
    context: string;
    current_plan: string;
    location: string;
  };
  limit_warning_shown: {
    resource: string;       // 'videos' | 'ideate_generations'
    used: number;
    limit: number;
    percentage: number;
    current_plan: string;
  };
  limit_reached: {
    resource: string;
    current_plan: string;
  };
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
  if (typeof window === 'undefined' || !window.gtag || !runtimeGaId) {
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

  // Vertical onboarding
  trackVerticalOnboardingStarted: () =>
    trackEvent('vertical_onboarding_started', {}),
  trackVerticalSelected: (vertical: string) =>
    trackEvent('vertical_selected', { vertical }),
  trackVerticalOnboardingCompleted: (vertical: string, market?: string, specialization?: string) =>
    trackEvent('vertical_onboarding_completed', { vertical, market, specialization }),

  // Script templates
  trackTemplateViewed: (templateId: string) =>
    trackEvent('script_template_viewed', { template_id: templateId }),
  trackTemplateCopied: (templateId: string) =>
    trackEvent('script_template_copied', { template_id: templateId }),
  trackTemplateSavedToScripts: (templateId: string) =>
    trackEvent('script_template_saved_to_scripts', { template_id: templateId }),
  trackTemplateOpenedInTeleprompter: (templateId: string) =>
    trackEvent('script_template_opened_in_teleprompter', { template_id: templateId }),

  // Content calendar
  trackCalendarViewed: (month: number) =>
    trackEvent('content_calendar_viewed', { month }),
  trackCalendarScriptClicked: (entryId: string, category: string) =>
    trackEvent('content_calendar_script_clicked', { entry_id: entryId, category }),

  // Dashboard suggestions
  trackDashboardSuggestionClicked: (suggestionType: string, category?: string) =>
    trackEvent('dashboard_suggestion_clicked', { suggestion_type: suggestionType, category }),

  // Upgrade funnel
  trackUpgradePromptShown: (promptType: string, context: string, currentPlan: string, location: string) =>
    trackEvent('upgrade_prompt_shown', { prompt_type: promptType, context, current_plan: currentPlan, location }),
  trackUpgradePromptClicked: (promptType: string, context: string, currentPlan: string, targetPlan: string, location: string) =>
    trackEvent('upgrade_prompt_clicked', { prompt_type: promptType, context, current_plan: currentPlan, target_plan: targetPlan, location }),
  trackUpgradePromptDismissed: (promptType: string, context: string, currentPlan: string, location: string) =>
    trackEvent('upgrade_prompt_dismissed', { prompt_type: promptType, context, current_plan: currentPlan, location }),
  trackLimitWarningShown: (resource: string, used: number, limit: number, currentPlan: string) =>
    trackEvent('limit_warning_shown', { resource, used, limit, percentage: Math.round((used / limit) * 100), current_plan: currentPlan }),
  trackLimitReached: (resource: string, currentPlan: string) =>
    trackEvent('limit_reached', { resource, current_plan: currentPlan }),
};
