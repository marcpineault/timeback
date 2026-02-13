-- AlterTable
ALTER TABLE "User" ADD COLUMN "ideateGenerationsThisMonth" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "Idea" ADD COLUMN "hookVariations" TEXT[],
ADD COLUMN "contentType" TEXT,
ADD COLUMN "engagementPlay" TEXT;
