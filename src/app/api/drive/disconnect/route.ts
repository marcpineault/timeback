import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { getOrCreateUser } from '@/lib/user';
import { disconnectGoogleDrive } from '@/lib/google-drive';

export async function POST() {
  try {
    const { userId: clerkId } = await auth();

    if (!clerkId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const user = await getOrCreateUser();
    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    await disconnectGoogleDrive(user.id);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Drive disconnect error:', error);
    return NextResponse.json(
      { error: 'Failed to disconnect Google Drive' },
      { status: 500 }
    );
  }
}
