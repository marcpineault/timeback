/**
 * Feature Flags Configuration
 *
 * Controls which features are available to which users.
 * Beta features are only shown to users in the BETA_TESTER_EMAILS list.
 */

// Emails that have access to beta features
const BETA_TESTER_EMAILS = new Set([
  'mpineault1@gmail.com',
]);

// Features that are currently in beta
export type BetaFeature =
  | 'speechCorrection';

/**
 * Check if an email has access to beta features
 */
export function isBetaTester(email: string | null | undefined): boolean {
  if (!email) return false;
  return BETA_TESTER_EMAILS.has(email.toLowerCase());
}

/**
 * Check if a specific feature is enabled for a user
 */
export function isFeatureEnabled(
  feature: BetaFeature,
  email: string | null | undefined
): boolean {
  // Define which features require beta access
  const betaFeatures: Set<BetaFeature> = new Set([
    'speechCorrection',
  ]);

  // If the feature is in beta, check if user is a beta tester
  if (betaFeatures.has(feature)) {
    return isBetaTester(email);
  }

  // Non-beta features are available to everyone
  return true;
}

/**
 * Get all enabled features for a user
 */
export function getEnabledFeatures(email: string | null | undefined): {
  speechCorrection: boolean;
} {
  return {
    speechCorrection: isFeatureEnabled('speechCorrection', email),
  };
}
