-- CreateEnum
CREATE TYPE "Vertical" AS ENUM ('MORTGAGE_BROKER', 'FINANCIAL_ADVISOR', 'REAL_ESTATE_AGENT', 'OTHER');

-- AlterTable
ALTER TABLE "User" ADD COLUMN "vertical" "Vertical",
ADD COLUMN "verticalCompletedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "VerticalProfile" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "vertical" TEXT NOT NULL,
    "market" TEXT NOT NULL,
    "specialization" TEXT NOT NULL,
    "tone" TEXT NOT NULL,
    "postingFrequency" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VerticalProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ScriptTemplate" (
    "id" TEXT NOT NULL,
    "vertical" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "scriptBody" TEXT NOT NULL,
    "wordCount" INTEGER NOT NULL,
    "tags" TEXT[],
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ScriptTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContentCalendar" (
    "id" TEXT NOT NULL,
    "vertical" TEXT NOT NULL,
    "month" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "contentAngle" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "isRecurring" BOOLEAN NOT NULL DEFAULT false,
    "specificDate" DATE,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ContentCalendar_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "VerticalProfile_userId_key" ON "VerticalProfile"("userId");

-- CreateIndex
CREATE INDEX "ScriptTemplate_vertical_idx" ON "ScriptTemplate"("vertical");

-- CreateIndex
CREATE INDEX "ScriptTemplate_vertical_category_idx" ON "ScriptTemplate"("vertical", "category");

-- CreateIndex
CREATE INDEX "ContentCalendar_vertical_idx" ON "ContentCalendar"("vertical");

-- CreateIndex
CREATE INDEX "ContentCalendar_vertical_month_idx" ON "ContentCalendar"("vertical", "month");

-- AddForeignKey
ALTER TABLE "VerticalProfile" ADD CONSTRAINT "VerticalProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
