import { NextResponse } from 'next/server';
import { isGoogleDriveConfigured, getGoogleClientId } from '@/lib/googleDrive';

export async function GET() {
  const clientId = getGoogleClientId();

  return NextResponse.json({
    configured: isGoogleDriveConfigured(),
    clientId: clientId || undefined,
    // App ID is derived from client ID (first part before the hyphen)
    appId: clientId ? clientId.split('-')[0] : undefined,
  });
}
