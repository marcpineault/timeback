import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { getOrCreateUser } from '@/lib/user';
import { uploadToDrive, isGoogleDriveConnected } from '@/lib/google-drive';

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

    // Check if Google Drive is connected
    const isConnected = await isGoogleDriveConnected(user.id);
    if (!isConnected) {
      return NextResponse.json(
        { error: 'Google Drive not connected' },
        { status: 400 }
      );
    }

    const { videoUrl, fileName } = await request.json();

    if (!videoUrl || !fileName) {
      return NextResponse.json(
        { error: 'Video URL and file name required' },
        { status: 400 }
      );
    }

    // Fetch the video file
    const response = await fetch(videoUrl);
    if (!response.ok) {
      return NextResponse.json(
        { error: 'Failed to fetch video' },
        { status: 400 }
      );
    }

    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // Upload to Google Drive
    const result = await uploadToDrive(user.id, buffer, fileName);

    return NextResponse.json({
      success: true,
      fileId: result.fileId,
      driveLink: result.webViewLink,
    });
  } catch (error) {
    console.error('Drive upload error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Upload failed' },
      { status: 500 }
    );
  }
}
