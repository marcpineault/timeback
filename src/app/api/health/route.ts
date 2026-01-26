import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { isS3Configured } from '@/lib/s3';

interface HealthCheck {
  status: 'healthy' | 'degraded' | 'unhealthy';
  checks: {
    database: { status: 'ok' | 'error'; latency?: number; error?: string };
    storage: { status: 'ok' | 'error' | 'not_configured'; type: string };
    openai: { status: 'ok' | 'error' | 'not_configured' };
    stripe: { status: 'ok' | 'not_configured' };
  };
  timestamp: string;
  version: string;
}

export async function GET() {
  const startTime = Date.now();
  const checks: HealthCheck['checks'] = {
    database: { status: 'ok' },
    storage: { status: 'ok', type: 'local' },
    openai: { status: 'ok' },
    stripe: { status: 'ok' },
  };

  // Check database connectivity
  try {
    const dbStart = Date.now();
    await prisma.$queryRaw`SELECT 1`;
    checks.database = { status: 'ok', latency: Date.now() - dbStart };
  } catch (error) {
    checks.database = {
      status: 'error',
      error: error instanceof Error ? error.message : 'Database connection failed',
    };
  }

  // Check storage configuration
  if (isS3Configured()) {
    checks.storage = { status: 'ok', type: 'cloudflare_r2' };
  } else if (process.env.UPLOADS_DIR || process.env.PROCESSED_DIR) {
    checks.storage = { status: 'ok', type: 'local_volume' };
  } else {
    checks.storage = { status: 'ok', type: 'local_filesystem' };
  }

  // Check OpenAI configuration
  if (process.env.OPENAI_API_KEY) {
    checks.openai = { status: 'ok' };
  } else {
    checks.openai = { status: 'not_configured' };
  }

  // Check Stripe configuration
  if (process.env.STRIPE_SECRET_KEY && process.env.STRIPE_WEBHOOK_SECRET) {
    checks.stripe = { status: 'ok' };
  } else {
    checks.stripe = { status: 'not_configured' };
  }

  // Determine overall status
  let status: HealthCheck['status'] = 'healthy';
  if (checks.database.status === 'error') {
    status = 'unhealthy';
  } else if (checks.openai.status === 'not_configured') {
    status = 'degraded';
  }

  const health: HealthCheck = {
    status,
    checks,
    timestamp: new Date().toISOString(),
    version: process.env.npm_package_version || '1.0.0',
  };

  const httpStatus = status === 'unhealthy' ? 503 : 200;
  return NextResponse.json(health, { status: httpStatus });
}
