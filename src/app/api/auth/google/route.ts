import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { getAuthUrl } from '@/lib/google-drive';
import { getOrCreateUser } from '@/lib/user';

export async function GET() {
  try {
    const { userId: clerkId } = await auth();

    if (!clerkId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const user = await getOrCreateUser();
    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    // Generate auth URL with user ID as state
    const authUrl = getAuthUrl(user.id);

    return NextResponse.redirect(authUrl);
  } catch (error) {
    console.error('Google auth error:', error);
    return NextResponse.json(
      { error: 'Failed to initiate Google auth' },
      { status: 500 }
    );
  }
}
