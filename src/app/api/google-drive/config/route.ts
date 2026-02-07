import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { isGoogleDriveConfigured, getGoogleClientId } from '@/lib/googleDrive';

export async function GET() {
  // SECURITY: Require authentication to prevent leaking configuration details
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const clientId = getGoogleClientId();

  return NextResponse.json({
    configured: isGoogleDriveConfigured(),
    clientId: clientId || undefined,
    appId: clientId ? clientId.split('-')[0] : undefined,
  });
}
