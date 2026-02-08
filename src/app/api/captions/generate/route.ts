import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { getOrCreateUser } from '@/lib/user';
import { generateCaption } from '@/lib/captionGenerator';

// POST - Generate an AI caption for a video
export async function POST(request: NextRequest) {
  try {
    const { userId: clerkId } = await auth();
    if (!clerkId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const user = await getOrCreateUser();
    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const body = await request.json();
    const { transcript, videoTitle } = body;

    if (!transcript) {
      return NextResponse.json(
        { error: 'Missing required field: transcript' },
        { status: 400 }
      );
    }

    const caption = await generateCaption({
      transcript,
      userId: user.id,
      videoTitle,
    });

    return NextResponse.json({ caption });
  } catch (error) {
    console.error('Error generating caption:', error);
    return NextResponse.json(
      { error: 'Failed to generate caption' },
      { status: 500 }
    );
  }
}
