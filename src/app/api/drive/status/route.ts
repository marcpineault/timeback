import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { getOrCreateUser } from '@/lib/user';
import { isGoogleDriveConnected } from '@/lib/google-drive';

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

    const connected = await isGoogleDriveConnected(user.id);

    return NextResponse.json({ connected });
  } catch (error) {
    console.error('Drive status error:', error);
    return NextResponse.json(
      { error: 'Failed to check Drive status' },
      { status: 500 }
    );
  }
}
