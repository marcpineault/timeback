-- CreateEnum
CREATE TYPE "Plan" AS ENUM ('FREE', 'PRO', 'CREATOR', 'ENTERPRISE');

-- CreateEnum
CREATE TYPE "VideoStatus" AS ENUM ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED');

-- CreateEnum
CREATE TYPE "PostStatus" AS ENUM ('QUEUED', 'SCHEDULED', 'PROCESSING_VIDEO', 'UPLOADING', 'PUBLISHED', 'FAILED', 'CANCELLED');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "clerkId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT,
    "plan" "Plan" NOT NULL DEFAULT 'FREE',
    "stripeCustomerId" TEXT,
    "stripeSubscriptionId" TEXT,
    "videosThisMonth" INTEGER NOT NULL DEFAULT 0,
    "resetDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "hasCompletedOnboarding" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "googleDriveAccessToken" TEXT,
    "googleDriveRefreshToken" TEXT,
    "googleDriveTokenExpiry" TIMESTAMP(3),
    "googleDriveConnected" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserProcessingPreferences" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "autoProcessOnUpload" BOOLEAN NOT NULL DEFAULT false,
    "activePreset" TEXT,
    "generateCaptions" BOOLEAN NOT NULL DEFAULT true,
    "captionStyle" TEXT NOT NULL DEFAULT 'instagram',
    "headline" TEXT NOT NULL DEFAULT '',
    "headlinePosition" TEXT NOT NULL DEFAULT 'top',
    "headlineStyle" TEXT NOT NULL DEFAULT 'speech-bubble',
    "useHookAsHeadline" BOOLEAN NOT NULL DEFAULT false,
    "generateAIHeadline" BOOLEAN NOT NULL DEFAULT false,
    "silenceThreshold" DOUBLE PRECISION NOT NULL DEFAULT -25,
    "silenceDuration" DOUBLE PRECISION NOT NULL DEFAULT 0.5,
    "autoSilenceThreshold" BOOLEAN NOT NULL DEFAULT true,
    "normalizeAudio" BOOLEAN NOT NULL DEFAULT true,
    "aspectRatio" TEXT NOT NULL DEFAULT 'original',
    "speechCorrection" BOOLEAN NOT NULL DEFAULT false,
    "removeFillerWords" BOOLEAN NOT NULL DEFAULT true,
    "removeRepeatedWords" BOOLEAN NOT NULL DEFAULT true,
    "removeRepeatedPhrases" BOOLEAN NOT NULL DEFAULT true,
    "removeFalseStarts" BOOLEAN NOT NULL DEFAULT true,
    "removeSelfCorrections" BOOLEAN NOT NULL DEFAULT true,
    "speechAggressiveness" TEXT NOT NULL DEFAULT 'moderate',
    "generateBRoll" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserProcessingPreferences_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Video" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "originalName" TEXT NOT NULL,
    "originalUrl" TEXT,
    "processedUrl" TEXT,
    "status" "VideoStatus" NOT NULL DEFAULT 'PENDING',
    "duration" INTEGER,
    "silenceRemoved" INTEGER,
    "transcript" TEXT,
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Video_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InstagramAccount" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "instagramUserId" TEXT NOT NULL,
    "instagramUsername" TEXT NOT NULL,
    "instagramProfilePic" TEXT,
    "facebookPageId" TEXT NOT NULL,
    "facebookPageName" TEXT,
    "accessToken" TEXT NOT NULL,
    "tokenExpiresAt" TIMESTAMP(3) NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "lastPublishedAt" TIMESTAMP(3),
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InstagramAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ScheduleSlot" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "instagramAccountId" TEXT NOT NULL,
    "dayOfWeek" INTEGER NOT NULL,
    "timeOfDay" TEXT NOT NULL,
    "timezone" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ScheduleSlot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ScheduledPost" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "instagramAccountId" TEXT NOT NULL,
    "videoId" TEXT NOT NULL,
    "caption" TEXT NOT NULL,
    "captionGenerated" BOOLEAN NOT NULL DEFAULT true,
    "hashtags" TEXT[],
    "coverImageUrl" TEXT,
    "scheduledFor" TIMESTAMP(3) NOT NULL,
    "publishedAt" TIMESTAMP(3),
    "status" "PostStatus" NOT NULL DEFAULT 'QUEUED',
    "igContainerId" TEXT,
    "igMediaId" TEXT,
    "igPermalink" TEXT,
    "retryCount" INTEGER NOT NULL DEFAULT 0,
    "lastError" TEXT,
    "lastAttemptAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ScheduledPost_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CaptionPreferences" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "brandVoice" TEXT NOT NULL DEFAULT 'casual',
    "niche" TEXT NOT NULL DEFAULT '',
    "captionStyle" TEXT NOT NULL DEFAULT 'hook-based',
    "hashtagCount" INTEGER NOT NULL DEFAULT 25,
    "customHashtags" TEXT[],
    "blockedHashtags" TEXT[],
    "defaultCTA" TEXT NOT NULL DEFAULT '',
    "includeCTA" BOOLEAN NOT NULL DEFAULT true,
    "exampleCaptions" TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CaptionPreferences_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Notification" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "read" BOOLEAN NOT NULL DEFAULT false,
    "data" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_clerkId_key" ON "User"("clerkId");

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "UserProcessingPreferences_userId_key" ON "UserProcessingPreferences"("userId");

-- CreateIndex
CREATE INDEX "Video_userId_idx" ON "Video"("userId");

-- CreateIndex
CREATE INDEX "Video_processedUrl_idx" ON "Video"("processedUrl");

-- CreateIndex
CREATE UNIQUE INDEX "InstagramAccount_instagramUserId_key" ON "InstagramAccount"("instagramUserId");

-- CreateIndex
CREATE INDEX "InstagramAccount_userId_idx" ON "InstagramAccount"("userId");

-- CreateIndex
CREATE INDEX "ScheduleSlot_userId_idx" ON "ScheduleSlot"("userId");

-- CreateIndex
CREATE INDEX "ScheduleSlot_instagramAccountId_idx" ON "ScheduleSlot"("instagramAccountId");

-- CreateIndex
CREATE UNIQUE INDEX "ScheduleSlot_instagramAccountId_dayOfWeek_timeOfDay_key" ON "ScheduleSlot"("instagramAccountId", "dayOfWeek", "timeOfDay");

-- CreateIndex
CREATE INDEX "ScheduledPost_userId_idx" ON "ScheduledPost"("userId");

-- CreateIndex
CREATE INDEX "ScheduledPost_instagramAccountId_idx" ON "ScheduledPost"("instagramAccountId");

-- CreateIndex
CREATE INDEX "ScheduledPost_scheduledFor_idx" ON "ScheduledPost"("scheduledFor");

-- CreateIndex
CREATE INDEX "ScheduledPost_status_idx" ON "ScheduledPost"("status");

-- CreateIndex
CREATE INDEX "ScheduledPost_status_scheduledFor_idx" ON "ScheduledPost"("status", "scheduledFor");

-- CreateIndex
CREATE UNIQUE INDEX "CaptionPreferences_userId_key" ON "CaptionPreferences"("userId");

-- CreateIndex
CREATE INDEX "Notification_userId_read_idx" ON "Notification"("userId", "read");

-- AddForeignKey
ALTER TABLE "UserProcessingPreferences" ADD CONSTRAINT "UserProcessingPreferences_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Video" ADD CONSTRAINT "Video_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InstagramAccount" ADD CONSTRAINT "InstagramAccount_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScheduleSlot" ADD CONSTRAINT "ScheduleSlot_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScheduleSlot" ADD CONSTRAINT "ScheduleSlot_instagramAccountId_fkey" FOREIGN KEY ("instagramAccountId") REFERENCES "InstagramAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScheduledPost" ADD CONSTRAINT "ScheduledPost_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScheduledPost" ADD CONSTRAINT "ScheduledPost_instagramAccountId_fkey" FOREIGN KEY ("instagramAccountId") REFERENCES "InstagramAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScheduledPost" ADD CONSTRAINT "ScheduledPost_videoId_fkey" FOREIGN KEY ("videoId") REFERENCES "Video"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CaptionPreferences" ADD CONSTRAINT "CaptionPreferences_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
