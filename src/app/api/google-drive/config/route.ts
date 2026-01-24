import { NextResponse } from 'next/server';
import { isGoogleDriveConfigured } from '@/lib/googleDrive';

export async function GET() {
  return NextResponse.json({
    configured: isGoogleDriveConfigured(),
  });
}
