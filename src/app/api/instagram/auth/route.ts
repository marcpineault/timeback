import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { getInstagramAuthUrl } from '@/lib/instagram';
import { randomBytes } from 'crypto';

export async function POST() {
  try {
    const { userId: clerkId } = await auth();
    if (!clerkId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Generate a state token for CSRF protection
    const state = randomBytes(32).toString('hex');

    // In production, store state in a short-lived session/cookie for verification
    // For now, encode clerkId into state so callback can identify the user
    const statePayload = Buffer.from(JSON.stringify({ clerkId, nonce: state })).toString('base64url');

    const authUrl = getInstagramAuthUrl(statePayload);

    return NextResponse.json({ authUrl, state: statePayload });
  } catch (error) {
    console.error('Instagram auth error:', error);
    return NextResponse.json(
      { error: 'Failed to generate Instagram auth URL' },
      { status: 500 }
    );
  }
}
