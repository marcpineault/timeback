/**
 * Cron Endpoint Authentication
 *
 * Secures cron API routes with a shared secret.
 */

import { NextRequest } from 'next/server';

/**
 * Verify that a cron request is authorized.
 * Checks the Authorization header for the CRON_SECRET.
 */
export function verifyCronAuth(request: NextRequest): boolean {
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret) {
    console.error('CRON_SECRET environment variable is not set');
    return false;
  }

  const authHeader = request.headers.get('authorization');
  if (!authHeader) return false;

  const token = authHeader.replace('Bearer ', '');
  return token === cronSecret;
}
