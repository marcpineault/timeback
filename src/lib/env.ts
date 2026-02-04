import { logger } from './logger';

interface EnvVar {
  name: string;
  required: boolean;
  description: string;
}

const ENV_VARS: EnvVar[] = [
  // Database
  { name: 'DATABASE_URL', required: true, description: 'PostgreSQL connection string' },

  // Clerk Auth
  { name: 'CLERK_SECRET_KEY', required: true, description: 'Clerk secret key for auth' },
  { name: 'NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY', required: true, description: 'Clerk publishable key' },
  { name: 'CLERK_WEBHOOK_SECRET', required: true, description: 'Clerk webhook signing secret' },

  // OpenAI
  { name: 'OPENAI_API_KEY', required: true, description: 'OpenAI API key for transcription' },

  // Stripe (optional - can be disabled)
  { name: 'STRIPE_SECRET_KEY', required: false, description: 'Stripe secret key for payments' },
  { name: 'STRIPE_WEBHOOK_SECRET', required: false, description: 'Stripe webhook signing secret' },
  { name: 'STRIPE_PRO_PRICE_ID', required: false, description: 'Stripe Pro plan price ID' },
  { name: 'STRIPE_CREATOR_PRICE_ID', required: false, description: 'Stripe Creator plan price ID' },

  // Storage (optional - defaults to local)
  { name: 'S3_BUCKET', required: false, description: 'S3/R2 bucket name' },
  { name: 'S3_REGION', required: false, description: 'S3/R2 region' },
  { name: 'S3_ACCESS_KEY_ID', required: false, description: 'S3/R2 access key' },
  { name: 'S3_SECRET_ACCESS_KEY', required: false, description: 'S3/R2 secret key' },
  { name: 'S3_ENDPOINT', required: false, description: 'S3/R2 endpoint URL' },

  // Google Drive (optional)
  { name: 'GOOGLE_CLIENT_ID', required: false, description: 'Google OAuth client ID' },
  { name: 'GOOGLE_CLIENT_SECRET', required: false, description: 'Google OAuth client secret' },

  // Analytics & Monitoring (optional but recommended)
  { name: 'NEXT_PUBLIC_GA_MEASUREMENT_ID', required: false, description: 'Google Analytics 4 measurement ID' },
  { name: 'SENTRY_DSN', required: false, description: 'Sentry DSN for server-side error tracking' },
  { name: 'NEXT_PUBLIC_SENTRY_DSN', required: false, description: 'Sentry DSN for client-side error tracking' },

  // App config
  { name: 'NEXT_PUBLIC_APP_URL', required: false, description: 'Public URL of the application' },
];

export interface EnvValidationResult {
  valid: boolean;
  missing: string[];
  warnings: string[];
}

export function validateEnv(): EnvValidationResult {
  const missing: string[] = [];
  const warnings: string[] = [];

  for (const envVar of ENV_VARS) {
    const value = process.env[envVar.name];

    if (!value) {
      if (envVar.required) {
        missing.push(`${envVar.name}: ${envVar.description}`);
      } else {
        // Only warn about optional vars that affect core functionality
        if (['STRIPE_SECRET_KEY', 'NEXT_PUBLIC_APP_URL'].includes(envVar.name)) {
          warnings.push(`${envVar.name}: ${envVar.description} (optional but recommended)`);
        }
      }
    }
  }

  return {
    valid: missing.length === 0,
    missing,
    warnings,
  };
}

export function logEnvValidation(): void {
  const result = validateEnv();

  if (result.missing.length > 0) {
    logger.error('Missing required environment variables', { missing: result.missing });
  }

  if (result.warnings.length > 0) {
    logger.warn('Missing optional environment variables', { warnings: result.warnings });
  }

  if (result.valid && result.warnings.length === 0) {
    logger.info('Environment validation passed');
  }
}
