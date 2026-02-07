import { logger } from './logger';

/**
 * Signup Security Module
 *
 * Protects the signup process by:
 * 1. Blocking disposable/temporary email domains
 * 2. Enforcing an email allowlist when enabled (for pre-launch)
 * 3. Verifying email verification status from Clerk
 */

// Common disposable email domains used by bots and spammers
const DISPOSABLE_EMAIL_DOMAINS = new Set([
  'mailinator.com',
  'guerrillamail.com',
  'guerrillamail.de',
  'grr.la',
  'guerrillamailblock.com',
  'tempmail.com',
  'temp-mail.org',
  'throwaway.email',
  'yopmail.com',
  'sharklasers.com',
  'guerrillamail.info',
  'guerrillamail.biz',
  'guerrillamail.net',
  'trashmail.com',
  'trashmail.me',
  'trashmail.net',
  'dispostable.com',
  'maildrop.cc',
  'fakeinbox.com',
  'mailnesia.com',
  'tempail.com',
  'tempr.email',
  'discard.email',
  'discardmail.com',
  'discardmail.de',
  'emailondeck.com',
  'getnada.com',
  'inboxbear.com',
  'mailcatch.com',
  'mailexpire.com',
  'mailforspam.com',
  'mohmal.com',
  'mytemp.email',
  'spamgourmet.com',
  'tempinbox.com',
  'throwawaymail.com',
  'tmail.ws',
  'tmpmail.net',
  'tmpmail.org',
  'wegwerfmail.de',
  'wegwerfmail.net',
  'mintemail.com',
  'harakirimail.com',
  'jetable.org',
  'mailnull.com',
  'bugmenot.com',
  'safetymail.info',
  'filzmail.com',
  'mailzilla.com',
  'spamfree24.org',
  'mailmoat.com',
  'trashymail.com',
  'tempomail.fr',
  'emailfake.com',
  'crazymailing.com',
  'mailtemp.info',
  'fakemailgenerator.com',
  '10minutemail.com',
  '10minutemail.net',
  'minutemail.com',
  'tempmailo.com',
  'burnermail.io',
  'guerrillamail.org',
]);

export interface SignupCheckResult {
  allowed: boolean;
  reason?: string;
}

/**
 * Extract domain from email address
 */
function getEmailDomain(email: string): string {
  return email.split('@')[1]?.toLowerCase() ?? '';
}

/**
 * Check if the email uses a disposable email provider
 */
function isDisposableEmail(email: string): boolean {
  const domain = getEmailDomain(email);
  return DISPOSABLE_EMAIL_DOMAINS.has(domain);
}

/**
 * Parse the allowlist from the environment variable.
 * Supports both full emails (user@example.com) and domains (@example.com).
 * Returns null if the allowlist is not configured (open registration).
 */
function getAllowlist(): { emails: Set<string>; domains: Set<string> } | null {
  const raw = process.env.SIGNUP_ALLOWLIST;
  if (!raw || raw.trim() === '') {
    return null;
  }

  const emails = new Set<string>();
  const domains = new Set<string>();

  for (const entry of raw.split(',')) {
    const trimmed = entry.trim().toLowerCase();
    if (!trimmed) continue;

    if (trimmed.startsWith('@')) {
      // Domain allowlist entry (e.g., @mycompany.com)
      domains.add(trimmed.slice(1));
    } else {
      // Specific email allowlist entry
      emails.add(trimmed);
    }
  }

  if (emails.size === 0 && domains.size === 0) {
    return null;
  }

  return { emails, domains };
}

/**
 * Check if an email is on the allowlist.
 * Returns true if the allowlist is not configured (open registration).
 */
function isOnAllowlist(email: string): boolean {
  const allowlist = getAllowlist();
  if (!allowlist) {
    // No allowlist configured — open registration
    return true;
  }

  const normalizedEmail = email.toLowerCase();
  if (allowlist.emails.has(normalizedEmail)) {
    return true;
  }

  const domain = getEmailDomain(normalizedEmail);
  if (allowlist.domains.has(domain)) {
    return true;
  }

  return false;
}

/**
 * Validate a signup email against all security checks.
 * Call this from the Clerk webhook handler before creating a user.
 */
export function validateSignupEmail(email: string): SignupCheckResult {
  const normalizedEmail = email.toLowerCase();

  // Check 1: Block disposable email addresses
  if (isDisposableEmail(normalizedEmail)) {
    logger.warn('Signup blocked: disposable email', {
      email: normalizedEmail,
      domain: getEmailDomain(normalizedEmail),
    });
    return {
      allowed: false,
      reason: 'Disposable email addresses are not allowed',
    };
  }

  // Check 2: Enforce allowlist (if configured)
  if (!isOnAllowlist(normalizedEmail)) {
    logger.warn('Signup blocked: email not on allowlist', {
      email: normalizedEmail,
    });
    return {
      allowed: false,
      reason: 'Email is not on the signup allowlist',
    };
  }

  return { allowed: true };
}

/**
 * Check if an email address from Clerk has been verified.
 * Clerk email_addresses include a verification object with status.
 */
export function isEmailVerified(
  emailAddress: { verification?: { status?: string } | null } | undefined
): boolean {
  return emailAddress?.verification?.status === 'verified';
}
