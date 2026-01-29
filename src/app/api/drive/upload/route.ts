import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { getOrCreateUser } from '@/lib/user';
import { uploadToDrive, isGoogleDriveConnected } from '@/lib/google-drive';

/**
 * Validate that a URL is safe to fetch (prevents SSRF attacks)
 * Only allows HTTPS URLs to trusted domains
 */
function isUrlSafeForFetch(urlString: string): boolean {
  try {
    const url = new URL(urlString);

    // Only allow HTTPS
    if (url.protocol !== 'https:') {
      return false;
    }

    // Block private/internal IP ranges and localhost
    const hostname = url.hostname.toLowerCase();

    // Block localhost and loopback
    if (hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1') {
      return false;
    }

    // Block private IP ranges (basic check - IPs in hostname)
    const ipv4Pattern = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;
    const ipMatch = hostname.match(ipv4Pattern);
    if (ipMatch) {
      const [, a, b, c] = ipMatch.map(Number);
      // Block 10.x.x.x, 172.16-31.x.x, 192.168.x.x, 169.254.x.x (link-local/cloud metadata)
      if (a === 10 || a === 127 ||
          (a === 172 && b >= 16 && b <= 31) ||
          (a === 192 && b === 168) ||
          (a === 169 && b === 254)) {
        return false;
      }
    }

    // Block cloud metadata endpoints
    if (hostname === 'metadata.google.internal' ||
        hostname === 'metadata.goog' ||
        hostname.endsWith('.internal')) {
      return false;
    }

    // Only allow our own API endpoints or known safe domains
    const allowedHostPatterns = [
      /^[a-z0-9-]+\.vercel\.app$/,  // Vercel deployments
      /^[a-z0-9-]+\.railway\.app$/, // Railway deployments
      /^[a-z0-9-]+\.onrender\.com$/, // Render deployments
      /^localhost:\d+$/,  // Local dev (only with port, and already blocked above for production)
    ];

    // Check if request is from our own app (same origin)
    const appUrl = process.env.NEXT_PUBLIC_APP_URL;
    if (appUrl) {
      try {
        const appHostname = new URL(appUrl).hostname;
        if (hostname === appHostname) {
          return true;
        }
      } catch {
        // Invalid app URL, continue with other checks
      }
    }

    // For video URLs, they should be from our API download endpoint
    if (url.pathname.startsWith('/api/download/')) {
      return true;
    }

    return false;
  } catch {
    return false;
  }
}

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

    // Validate URL to prevent SSRF attacks
    if (!isUrlSafeForFetch(videoUrl)) {
      return NextResponse.json(
        { error: 'Invalid video URL' },
        { status: 400 }
      );
    }

    // Fetch the video file
    const response = await fetch(videoUrl, { redirect: 'error' });
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
