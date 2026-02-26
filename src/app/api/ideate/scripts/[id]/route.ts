import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { getOrCreateUser } from '@/lib/user';
import { prisma } from '@/lib/db';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { userId: clerkId } = await auth();
    if (!clerkId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const user = await getOrCreateUser();
    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const { id } = await params;

    const script = await prisma.script.findFirst({
      where: { id, userId: user.id },
      include: {
        idea: { select: { title: true, hook: true } },
      },
    });

    if (!script) {
      return NextResponse.json({ error: 'Script not found' }, { status: 404 });
    }

    return NextResponse.json({ script });
  } catch (error) {
    console.error('Error fetching script:', error);
    return NextResponse.json(
      { error: 'Failed to fetch script' },
      { status: 500 }
    );
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { userId: clerkId } = await auth();
    if (!clerkId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const user = await getOrCreateUser();
    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const { id } = await params;
    const body = await request.json();

    // Verify ownership
    const existing = await prisma.script.findFirst({
      where: { id, userId: user.id },
    });

    if (!existing) {
      return NextResponse.json({ error: 'Script not found' }, { status: 404 });
    }

    // On first edit, preserve original AI-generated content
    const originalFields: Record<string, string> = {};
    if (!existing.isEdited && !existing.originalFullScript) {
      originalFields.originalHook = existing.hook;
      originalFields.originalBody = existing.body;
      originalFields.originalCta = existing.cta;
      originalFields.originalFullScript = existing.fullScript;
    }

    const wordCount = (body.fullScript || existing.fullScript)
      .replace(/\[PAUSE\]/g, '')
      .split(/\s+/)
      .filter(Boolean).length;

    // If headlineClean is being updated by the user, recompute accent_words fallback
    const headlineUpdate: Record<string, unknown> = {};
    if (body.headlineClean !== undefined) {
      headlineUpdate.headlineClean = body.headlineClean;
      headlineUpdate.headlineText = body.headlineClean; // Reset formatted version

      // Recompute accent words: if the user changed the headline and existing accent words
      // no longer match, fall back to highlighting the first number or last word
      const cleanText = body.headlineClean as string;
      const existingAccent = existing.accentWords || [];
      const wordsStillMatch = existingAccent.length > 0 &&
        existingAccent.every((w: string) => cleanText.toLowerCase().includes(w.toLowerCase()));

      if (wordsStillMatch) {
        headlineUpdate.accentWords = existingAccent;
      } else {
        // Fallback: first number found, or last word
        const words = cleanText.split(/\s+/).filter(Boolean);
        const numberWord = words.find((w: string) => /\d/.test(w));
        headlineUpdate.accentWords = numberWord ? [numberWord] : words.length > 0 ? [words[words.length - 1]] : [];
      }
    }

    const script = await prisma.script.update({
      where: { id },
      data: {
        hook: body.hook ?? existing.hook,
        body: body.body ?? existing.body,
        cta: body.cta ?? existing.cta,
        fullScript: body.fullScript ?? existing.fullScript,
        wordCount,
        estimatedDuration: Math.round((wordCount / 150) * 60),
        isEdited: true,
        version: { increment: 1 },
        ...originalFields,
        ...headlineUpdate,
      },
    });

    return NextResponse.json({ script });
  } catch (error) {
    console.error('Error updating script:', error);
    return NextResponse.json(
      { error: 'Failed to update script' },
      { status: 500 }
    );
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { userId: clerkId } = await auth();
    if (!clerkId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const user = await getOrCreateUser();
    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const { id } = await params;
    const body = await request.json();

    // Verify ownership
    const existing = await prisma.script.findFirst({
      where: { id, userId: user.id },
    });

    if (!existing) {
      return NextResponse.json({ error: 'Script not found' }, { status: 404 });
    }

    const data: Record<string, unknown> = {};
    if (body.status) data.status = body.status;
    if (body.rating !== undefined) data.rating = body.rating;

    const script = await prisma.script.update({
      where: { id },
      data,
    });

    return NextResponse.json({ script });
  } catch (error) {
    console.error('Error patching script:', error);
    return NextResponse.json(
      { error: 'Failed to update script' },
      { status: 500 }
    );
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { userId: clerkId } = await auth();
    if (!clerkId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const user = await getOrCreateUser();
    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const { id } = await params;

    const existing = await prisma.script.findFirst({
      where: { id, userId: user.id },
    });

    if (!existing) {
      return NextResponse.json({ error: 'Script not found' }, { status: 404 });
    }

    await prisma.script.delete({ where: { id } });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting script:', error);
    return NextResponse.json(
      { error: 'Failed to delete script' },
      { status: 500 }
    );
  }
}
