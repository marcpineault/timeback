-- CreateEnum
CREATE TYPE "IdeaStatus" AS ENUM ('SAVED', 'SCRIPTED', 'FILMED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "ScriptStatus" AS ENUM ('DRAFT', 'READY', 'FILMED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "SwipeCategory" AS ENUM ('HOOK', 'MEAT', 'CTA', 'FULL');

-- AlterTable
ALTER TABLE "UserProcessingPreferences" ADD COLUMN     "customFillerPhrases" TEXT[],
ADD COLUMN     "customFillerWords" TEXT[],
ADD COLUMN     "speechConfidenceThreshold" DOUBLE PRECISION NOT NULL DEFAULT 0.6,
ADD COLUMN     "speechCorrectionPreset" TEXT,
ADD COLUMN     "speechLanguage" TEXT NOT NULL DEFAULT 'auto';

-- CreateTable
CREATE TABLE "CreatorProfile" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "niche" TEXT NOT NULL DEFAULT '',
    "targetAudience" TEXT NOT NULL DEFAULT '',
    "contentGoal" TEXT NOT NULL DEFAULT '',
    "statusProof" TEXT[],
    "powerExamples" TEXT[],
    "credibilityMarkers" TEXT[],
    "likenessTraits" TEXT[],
    "toneOfVoice" TEXT NOT NULL DEFAULT 'direct',
    "personalCatchphrases" TEXT[],
    "avoidTopics" TEXT[],
    "exampleScripts" TEXT[],
    "primaryPlatform" TEXT NOT NULL DEFAULT 'instagram',
    "typicalVideoLength" INTEGER NOT NULL DEFAULT 60,
    "isComplete" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CreatorProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Idea" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "hook" TEXT NOT NULL,
    "angle" TEXT NOT NULL,
    "spclElements" JSONB NOT NULL,
    "targetEmotion" TEXT NOT NULL,
    "estimatedLength" INTEGER NOT NULL DEFAULT 60,
    "status" "IdeaStatus" NOT NULL DEFAULT 'SAVED',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Idea_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Script" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "ideaId" TEXT,
    "title" TEXT NOT NULL,
    "hook" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "cta" TEXT NOT NULL,
    "fullScript" TEXT NOT NULL,
    "estimatedDuration" INTEGER NOT NULL DEFAULT 60,
    "wordCount" INTEGER NOT NULL DEFAULT 0,
    "spclBreakdown" JSONB,
    "isEdited" BOOLEAN NOT NULL DEFAULT false,
    "version" INTEGER NOT NULL DEFAULT 1,
    "rating" TEXT,
    "originalHook" TEXT,
    "originalBody" TEXT,
    "originalCta" TEXT,
    "originalFullScript" TEXT,
    "status" "ScriptStatus" NOT NULL DEFAULT 'DRAFT',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Script_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SwipeEntry" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "hook" TEXT NOT NULL,
    "meat" TEXT NOT NULL,
    "cta" TEXT NOT NULL,
    "fullExample" TEXT NOT NULL,
    "analysis" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "category" "SwipeCategory" NOT NULL,
    "format" TEXT NOT NULL DEFAULT 'direct-to-camera',
    "niche" TEXT NOT NULL,
    "tags" TEXT[],
    "isSaved" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SwipeEntry_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CreatorProfile_userId_key" ON "CreatorProfile"("userId");

-- CreateIndex
CREATE INDEX "Idea_userId_idx" ON "Idea"("userId");

-- CreateIndex
CREATE INDEX "Idea_userId_status_idx" ON "Idea"("userId", "status");

-- CreateIndex
CREATE INDEX "Script_userId_idx" ON "Script"("userId");

-- CreateIndex
CREATE INDEX "Script_ideaId_idx" ON "Script"("ideaId");

-- CreateIndex
CREATE INDEX "Script_userId_status_idx" ON "Script"("userId", "status");

-- CreateIndex
CREATE INDEX "Script_userId_rating_idx" ON "Script"("userId", "rating");

-- CreateIndex
CREATE INDEX "SwipeEntry_userId_idx" ON "SwipeEntry"("userId");

-- CreateIndex
CREATE INDEX "SwipeEntry_userId_category_idx" ON "SwipeEntry"("userId", "category");

-- CreateIndex
CREATE INDEX "SwipeEntry_userId_isSaved_idx" ON "SwipeEntry"("userId", "isSaved");

-- AddForeignKey
ALTER TABLE "CreatorProfile" ADD CONSTRAINT "CreatorProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Idea" ADD CONSTRAINT "Idea_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Script" ADD CONSTRAINT "Script_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Script" ADD CONSTRAINT "Script_ideaId_fkey" FOREIGN KEY ("ideaId") REFERENCES "Idea"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SwipeEntry" ADD CONSTRAINT "SwipeEntry_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
