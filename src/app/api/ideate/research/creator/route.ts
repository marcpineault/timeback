import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { getOrCreateUser, canGenerateIdeate, incrementIdeateCount } from '@/lib/user';
import { prisma } from '@/lib/db';
import { lookupCreator } from '@/lib/instagramResearch';
import { analyzeTopVideos } from '@/lib/topVideosAnalyzer';
import type { CreatorContext } from '@/lib/scriptGenerator';

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

    // Check ideate generation limit
    const { allowed, reason } = await canGenerateIdeate(user.id);
    if (!allowed) {
      return NextResponse.json({ error: reason }, { status: 403 });
    }

    const body = await request.json();
    const { username } = body;

    if (!username || typeof username !== 'string') {
      return NextResponse.json({ error: 'Instagram username is required' }, { status: 400 });
    }

    // Require connected Instagram account
    const igAccount = await prisma.instagramAccount.findFirst({
      where: { userId: user.id, isActive: true },
    });

    if (!igAccount) {
      return NextResponse.json(
        { error: 'Please connect your Instagram account first' },
        { status: 400 }
      );
    }

    if (!igAccount.userAccessToken) {
      return NextResponse.json(
        { error: 'Please reconnect your Instagram account to enable creator research' },
        { status: 400 }
      );
    }

    // Require creator profile
    const profile = await prisma.creatorProfile.findUnique({
      where: { userId: user.id },
    });

    if (!profile || !profile.isComplete) {
      return NextResponse.json(
        { error: 'Please complete your creator profile first' },
        { status: 400 }
      );
    }

    // Look up the creator on Instagram
    // Business Discovery API requires a User Access Token, not a Page Access Token
    const { creator, videos } = await lookupCreator(
      igAccount.instagramUserId,
      igAccount.userAccessToken,
      username
    );

    if (videos.length === 0) {
      return NextResponse.json(
        { error: `No video content found for @${creator.username}. They may not have any public Reels.` },
        { status: 404 }
      );
    }

    // Build creator context for AI analysis
    const creatorContext: CreatorContext = {
      niche: profile.niche,
      targetAudience: profile.targetAudience,
      contentGoal: profile.contentGoal,
      originStory: profile.originStory,
      struggle: profile.struggle,
      mission: profile.mission,
      statusProof: profile.statusProof,
      powerExamples: profile.powerExamples,
      credibilityMarkers: profile.credibilityMarkers,
      likenessTraits: profile.likenessTraits,
      toneOfVoice: profile.toneOfVoice,
      personalCatchphrases: profile.personalCatchphrases,
      avoidTopics: profile.avoidTopics,
      exampleScripts: profile.exampleScripts,
      primaryPlatform: profile.primaryPlatform,
      typicalVideoLength: profile.typicalVideoLength,
    };

    // Analyze videos with Claude
    const analyzedVideos = await analyzeTopVideos(
      videos,
      creatorContext,
      creator.username,
      creator.followers_count
    );

    // Save search and results to database
    const search = await prisma.topVideoSearch.create({
      data: {
        userId: user.id,
        searchType: 'creator',
        query: creator.username,
        creatorUsername: creator.username,
        creatorFollowers: creator.followers_count,
        creatorBio: creator.biography,
      },
    });

    const savedVideos = await Promise.all(
      analyzedVideos.map((v) =>
        prisma.topVideo.create({
          data: {
            userId: user.id,
            searchId: search.id,
            igMediaId: v.igMediaId,
            permalink: v.permalink,
            caption: v.caption,
            mediaType: v.mediaType,
            likeCount: v.likeCount,
            commentsCount: v.commentsCount,
            videoTimestamp: v.videoTimestamp ? new Date(v.videoTimestamp) : null,
            creatorUsername: v.creatorUsername,
            creatorFollowers: v.creatorFollowers,
            hook: v.hook,
            hookFormula: v.hookFormula,
            hookAnalysis: v.hookAnalysis,
            hookStrength: v.hookStrength,
            contentStructure: v.contentStructure,
            viralPattern: v.viralPattern,
            whyItWorks: v.whyItWorks,
            targetEmotion: v.targetEmotion,
            engagementDriver: v.engagementDriver,
            adaptedHook: v.adaptedHook,
            adaptedHookVariations: v.adaptedHookVariations,
            adaptationNotes: v.adaptationNotes,
            tags: v.tags,
            contentType: v.contentType,
            format: v.format,
          },
        })
      )
    );

    // Increment usage counter
    await incrementIdeateCount(user.id);

    return NextResponse.json({
      search: {
        id: search.id,
        creator: {
          username: creator.username,
          name: creator.name,
          biography: creator.biography,
          followers_count: creator.followers_count,
          profile_picture_url: creator.profile_picture_url,
        },
      },
      videos: savedVideos,
    });
  } catch (error) {
    console.error('Error researching creator:', error);
    const message = error instanceof Error ? error.message : 'Failed to research creator';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
