-- Add onboarding flag to User table
ALTER TABLE "User" ADD COLUMN "hasCompletedOnboarding" BOOLEAN NOT NULL DEFAULT false;
