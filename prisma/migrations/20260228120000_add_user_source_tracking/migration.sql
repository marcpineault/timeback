-- AlterTable
ALTER TABLE "User" ADD COLUMN "utmSource" TEXT,
ADD COLUMN "utmMedium" TEXT,
ADD COLUMN "utmCampaign" TEXT,
ADD COLUMN "utmContent" TEXT,
ADD COLUMN "utmTerm" TEXT,
ADD COLUMN "referrer" TEXT,
ADD COLUMN "landingPage" TEXT;
