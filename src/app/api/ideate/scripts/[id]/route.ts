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
