import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { getOrCreateUser } from '@/lib/user';
import { prisma } from '@/lib/db';

// GET - Fetch script templates for user's vertical
export async function GET(request: NextRequest) {
  try {
    const { userId: clerkId } = await auth();
    if (!clerkId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const user = await getOrCreateUser();
    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    if (!user.vertical) {
      return NextResponse.json({ templates: [], vertical: null });
    }

    const { searchParams } = new URL(request.url);
    const category = searchParams.get('category');

    const where: Record<string, unknown> = {
      vertical: user.vertical,
      isActive: true,
    };
    if (category) where.category = category;

    const templates = await prisma.scriptTemplate.findMany({
      where,
      orderBy: { sortOrder: 'asc' },
    });

    // Fetch user's market for client-side variable replacement
    const verticalProfile = await prisma.verticalProfile.findUnique({
      where: { userId: user.id },
      select: { market: true },
    });

    return NextResponse.json({
      templates,
      vertical: user.vertical,
      market: verticalProfile?.market || null,
    });
  } catch (error) {
    console.error('Error fetching templates:', error);
    return NextResponse.json(
      { error: 'Failed to fetch templates' },
      { status: 500 }
    );
  }
}

// POST - Save a template to user's personal scripts as a DRAFT
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
    const { templateId } = body;

    if (!templateId) {
      return NextResponse.json({ error: 'templateId is required' }, { status: 400 });
    }

    const template = await prisma.scriptTemplate.findUnique({
      where: { id: templateId },
    });

    if (!template) {
      return NextResponse.json({ error: 'Template not found' }, { status: 404 });
    }

    // Get user's market for variable replacement
    const verticalProfile = await prisma.verticalProfile.findUnique({
      where: { userId: user.id },
      select: { market: true },
    });

    let scriptBody = template.scriptBody;
    if (verticalProfile?.market) {
      scriptBody = scriptBody
        .replace(/\[city\]/gi, verticalProfile.market)
        .replace(/\[market\]/gi, verticalProfile.market);
    }

    // Create a new Script as DRAFT with template content
    const script = await prisma.script.create({
      data: {
        userId: user.id,
        title: template.title,
        hook: '',
        body: scriptBody,
        cta: '',
        fullScript: scriptBody,
        wordCount: template.wordCount,
        estimatedDuration: Math.round((template.wordCount / 150) * 60),
        status: 'DRAFT',
      },
    });

    return NextResponse.json({ script });
  } catch (error) {
    console.error('Error saving template to scripts:', error);
    return NextResponse.json(
      { error: 'Failed to save template' },
      { status: 500 }
    );
  }
}
