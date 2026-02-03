-- Manual migration: Add UserProcessingPreferences table
-- Run this SQL directly on your PostgreSQL database if Prisma CLI isn't working

-- CreateTable
CREATE TABLE IF NOT EXISTS "UserProcessingPreferences" (
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

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "UserProcessingPreferences_userId_key" ON "UserProcessingPreferences"("userId");

-- AddForeignKey
ALTER TABLE "UserProcessingPreferences"
ADD CONSTRAINT "UserProcessingPreferences_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
