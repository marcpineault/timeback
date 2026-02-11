import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { getOrCreateUser } from '@/lib/user';
import { prisma } from '@/lib/db';

// GET - Fetch user's processing preferences
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

    // Fetch preferences or return defaults
    const preferences = await prisma.userProcessingPreferences.findUnique({
      where: { userId: user.id },
    });

    if (!preferences) {
      // Return default preferences (user hasn't saved any yet)
      return NextResponse.json({
        preferences: null,
        isDefault: true,
      });
    }

    return NextResponse.json({
      preferences: {
        autoProcessOnUpload: preferences.autoProcessOnUpload,
        activePreset: preferences.activePreset,
        generateCaptions: preferences.generateCaptions,
        captionStyle: preferences.captionStyle,
        headline: preferences.headline,
        headlinePosition: preferences.headlinePosition,
        headlineStyle: preferences.headlineStyle,
        useHookAsHeadline: preferences.useHookAsHeadline,
        generateAIHeadline: preferences.generateAIHeadline,
        silenceThreshold: preferences.silenceThreshold,
        silenceDuration: preferences.silenceDuration,
        autoSilenceThreshold: preferences.autoSilenceThreshold,
        normalizeAudio: preferences.normalizeAudio,
        aspectRatio: preferences.aspectRatio,
        speechCorrection: preferences.speechCorrection,
        speechCorrectionConfig: {
          removeFillerWords: preferences.removeFillerWords,
          removeRepeatedWords: preferences.removeRepeatedWords,
          removeRepeatedPhrases: preferences.removeRepeatedPhrases,
          removeFalseStarts: preferences.removeFalseStarts,
          removeSelfCorrections: preferences.removeSelfCorrections,
          aggressiveness: preferences.speechAggressiveness,
          confidenceThreshold: preferences.speechConfidenceThreshold,
          language: preferences.speechLanguage,
          customFillerWords: preferences.customFillerWords,
          customFillerPhrases: preferences.customFillerPhrases,
        },
        speechCorrectionPreset: preferences.speechCorrectionPreset,
        generateBRoll: preferences.generateBRoll,
      },
      isDefault: false,
    });
  } catch (error) {
    console.error('Error fetching preferences:', error);
    return NextResponse.json(
      { error: 'Failed to fetch preferences' },
      { status: 500 }
    );
  }
}

// PATCH - Partially update user's processing preferences (only updates fields that are sent)
export async function PATCH(request: Request) {
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

    // SECURITY: Validate input types before passing to Prisma
    const booleanFields = [
      'autoProcessOnUpload', 'generateCaptions', 'useHookAsHeadline',
      'generateAIHeadline', 'autoSilenceThreshold', 'normalizeAudio',
      'speechCorrection', 'generateBRoll',
    ] as const;
    const stringFields = [
      'activePreset', 'captionStyle', 'headline', 'headlinePosition',
      'headlineStyle', 'aspectRatio',
    ] as const;
    const numberFields = ['silenceThreshold', 'silenceDuration'] as const;

    for (const field of booleanFields) {
      if (body[field] !== undefined && typeof body[field] !== 'boolean') {
        return NextResponse.json({ error: `${field} must be a boolean` }, { status: 400 });
      }
    }
    for (const field of stringFields) {
      if (body[field] !== undefined && typeof body[field] !== 'string') {
        return NextResponse.json({ error: `${field} must be a string` }, { status: 400 });
      }
    }
    for (const field of numberFields) {
      if (body[field] !== undefined && (typeof body[field] !== 'number' || !Number.isFinite(body[field]))) {
        return NextResponse.json({ error: `${field} must be a finite number` }, { status: 400 });
      }
    }

    // Only include fields that were actually sent in the request
    const updateData: Record<string, unknown> = {};
    if (body.autoProcessOnUpload !== undefined) updateData.autoProcessOnUpload = body.autoProcessOnUpload;
    if (body.activePreset !== undefined) updateData.activePreset = body.activePreset;
    if (body.generateCaptions !== undefined) updateData.generateCaptions = body.generateCaptions;
    if (body.captionStyle !== undefined) updateData.captionStyle = body.captionStyle;
    if (body.headline !== undefined) updateData.headline = body.headline;
    if (body.headlinePosition !== undefined) updateData.headlinePosition = body.headlinePosition;
    if (body.headlineStyle !== undefined) updateData.headlineStyle = body.headlineStyle;
    if (body.useHookAsHeadline !== undefined) updateData.useHookAsHeadline = body.useHookAsHeadline;
    if (body.generateAIHeadline !== undefined) updateData.generateAIHeadline = body.generateAIHeadline;
    if (body.silenceThreshold !== undefined) updateData.silenceThreshold = body.silenceThreshold;
    if (body.silenceDuration !== undefined) updateData.silenceDuration = body.silenceDuration;
    if (body.autoSilenceThreshold !== undefined) updateData.autoSilenceThreshold = body.autoSilenceThreshold;
    if (body.normalizeAudio !== undefined) updateData.normalizeAudio = body.normalizeAudio;
    if (body.aspectRatio !== undefined) updateData.aspectRatio = body.aspectRatio;
    if (body.speechCorrection !== undefined) updateData.speechCorrection = body.speechCorrection;
    if (body.generateBRoll !== undefined) updateData.generateBRoll = body.generateBRoll;

    // Upsert: create with defaults if not exists, otherwise only update sent fields
    const preferences = await prisma.userProcessingPreferences.upsert({
      where: { userId: user.id },
      create: {
        userId: user.id,
        ...updateData,
      },
      update: updateData,
    });

    return NextResponse.json({ success: true, preferences: { autoProcessOnUpload: preferences.autoProcessOnUpload } });
  } catch (error) {
    console.error('Error patching preferences:', error);
    return NextResponse.json(
      { error: 'Failed to update preferences' },
      { status: 500 }
    );
  }
}

// PUT - Save user's full processing preferences (replaces all fields)
export async function PUT(request: Request) {
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

    // Extract and validate preferences from request body
    const preferencesData = {
      autoProcessOnUpload: body.autoProcessOnUpload ?? false,
      activePreset: body.activePreset ?? null,
      generateCaptions: body.generateCaptions ?? true,
      captionStyle: body.captionStyle ?? 'instagram',
      headline: body.headline ?? '',
      headlinePosition: body.headlinePosition ?? 'top',
      headlineStyle: body.headlineStyle ?? 'speech-bubble',
      useHookAsHeadline: body.useHookAsHeadline ?? false,
      generateAIHeadline: body.generateAIHeadline ?? false,
      silenceThreshold: body.silenceThreshold ?? -25,
      silenceDuration: body.silenceDuration ?? 0.5,
      autoSilenceThreshold: body.autoSilenceThreshold ?? true,
      normalizeAudio: body.normalizeAudio ?? true,
      aspectRatio: body.aspectRatio ?? 'original',
      speechCorrection: body.speechCorrection ?? false,
      removeFillerWords: body.speechCorrectionConfig?.removeFillerWords ?? true,
      removeRepeatedWords: body.speechCorrectionConfig?.removeRepeatedWords ?? true,
      removeRepeatedPhrases: body.speechCorrectionConfig?.removeRepeatedPhrases ?? true,
      removeFalseStarts: body.speechCorrectionConfig?.removeFalseStarts ?? true,
      removeSelfCorrections: body.speechCorrectionConfig?.removeSelfCorrections ?? true,
      speechAggressiveness: body.speechCorrectionConfig?.aggressiveness ?? 'moderate',
      speechConfidenceThreshold: body.speechCorrectionConfig?.confidenceThreshold ?? 0.6,
      speechLanguage: body.speechCorrectionConfig?.language ?? 'auto',
      customFillerWords: body.speechCorrectionConfig?.customFillerWords ?? [],
      customFillerPhrases: body.speechCorrectionConfig?.customFillerPhrases ?? [],
      speechCorrectionPreset: body.speechCorrectionPreset ?? null,
      generateBRoll: body.generateBRoll ?? false,
    };

    // Upsert preferences (create if not exists, update if exists)
    const preferences = await prisma.userProcessingPreferences.upsert({
      where: { userId: user.id },
      create: {
        userId: user.id,
        ...preferencesData,
      },
      update: preferencesData,
    });

    return NextResponse.json({
      success: true,
      preferences: {
        autoProcessOnUpload: preferences.autoProcessOnUpload,
        activePreset: preferences.activePreset,
        generateCaptions: preferences.generateCaptions,
        captionStyle: preferences.captionStyle,
        headline: preferences.headline,
        headlinePosition: preferences.headlinePosition,
        headlineStyle: preferences.headlineStyle,
        useHookAsHeadline: preferences.useHookAsHeadline,
        generateAIHeadline: preferences.generateAIHeadline,
        silenceThreshold: preferences.silenceThreshold,
        silenceDuration: preferences.silenceDuration,
        autoSilenceThreshold: preferences.autoSilenceThreshold,
        normalizeAudio: preferences.normalizeAudio,
        aspectRatio: preferences.aspectRatio,
        speechCorrection: preferences.speechCorrection,
        speechCorrectionConfig: {
          removeFillerWords: preferences.removeFillerWords,
          removeRepeatedWords: preferences.removeRepeatedWords,
          removeRepeatedPhrases: preferences.removeRepeatedPhrases,
          removeFalseStarts: preferences.removeFalseStarts,
          removeSelfCorrections: preferences.removeSelfCorrections,
          aggressiveness: preferences.speechAggressiveness,
          confidenceThreshold: preferences.speechConfidenceThreshold,
          language: preferences.speechLanguage,
          customFillerWords: preferences.customFillerWords,
          customFillerPhrases: preferences.customFillerPhrases,
        },
        speechCorrectionPreset: preferences.speechCorrectionPreset,
        generateBRoll: preferences.generateBRoll,
      },
    });
  } catch (error) {
    console.error('Error saving preferences:', error);
    return NextResponse.json(
      { error: 'Failed to save preferences' },
      { status: 500 }
    );
  }
}
