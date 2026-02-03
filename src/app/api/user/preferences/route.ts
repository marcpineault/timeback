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
        },
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

// PUT - Save user's processing preferences
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
        },
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
