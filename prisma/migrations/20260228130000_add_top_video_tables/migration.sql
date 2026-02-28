-- CreateTable
CREATE TABLE "TopVideoSearch" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "searchType" TEXT NOT NULL,
    "query" TEXT NOT NULL,
    "platform" TEXT NOT NULL DEFAULT 'instagram',
    "creatorUsername" TEXT,
    "creatorFollowers" INTEGER,
    "creatorBio" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TopVideoSearch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TopVideo" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "searchId" TEXT NOT NULL,
    "igMediaId" TEXT,
    "permalink" TEXT NOT NULL,
    "caption" TEXT NOT NULL DEFAULT '',
    "mediaType" TEXT NOT NULL DEFAULT 'VIDEO',
    "likeCount" INTEGER NOT NULL DEFAULT 0,
    "commentsCount" INTEGER NOT NULL DEFAULT 0,
    "videoTimestamp" TIMESTAMP(3),
    "creatorUsername" TEXT,
    "creatorFollowers" INTEGER,
    "hook" TEXT NOT NULL DEFAULT '',
    "hookFormula" TEXT NOT NULL DEFAULT '',
    "hookAnalysis" TEXT NOT NULL DEFAULT '',
    "hookStrength" INTEGER NOT NULL DEFAULT 0,
    "contentStructure" TEXT NOT NULL DEFAULT '',
    "viralPattern" TEXT NOT NULL DEFAULT '',
    "whyItWorks" TEXT NOT NULL DEFAULT '',
    "targetEmotion" TEXT NOT NULL DEFAULT '',
    "engagementDriver" TEXT NOT NULL DEFAULT '',
    "adaptedHook" TEXT NOT NULL DEFAULT '',
    "adaptedHookVariations" TEXT[],
    "adaptationNotes" TEXT NOT NULL DEFAULT '',
    "tags" TEXT[],
    "contentType" TEXT NOT NULL DEFAULT '',
    "format" TEXT NOT NULL DEFAULT '',
    "isSaved" BOOLEAN NOT NULL DEFAULT false,
    "isUsedAsIdea" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TopVideo_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TopVideoSearch_userId_idx" ON "TopVideoSearch"("userId");

-- CreateIndex
CREATE INDEX "TopVideoSearch_userId_searchType_idx" ON "TopVideoSearch"("userId", "searchType");

-- CreateIndex
CREATE INDEX "TopVideo_userId_idx" ON "TopVideo"("userId");

-- CreateIndex
CREATE INDEX "TopVideo_userId_isSaved_idx" ON "TopVideo"("userId", "isSaved");

-- CreateIndex
CREATE INDEX "TopVideo_searchId_idx" ON "TopVideo"("searchId");

-- AddForeignKey
ALTER TABLE "TopVideoSearch" ADD CONSTRAINT "TopVideoSearch_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TopVideo" ADD CONSTRAINT "TopVideo_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TopVideo" ADD CONSTRAINT "TopVideo_searchId_fkey" FOREIGN KEY ("searchId") REFERENCES "TopVideoSearch"("id") ON DELETE CASCADE ON UPDATE CASCADE;
