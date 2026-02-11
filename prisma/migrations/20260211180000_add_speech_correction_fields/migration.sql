-- AlterTable
ALTER TABLE "UserProcessingPreferences" ADD COLUMN "speechConfidenceThreshold" DOUBLE PRECISION NOT NULL DEFAULT 0.6;
ALTER TABLE "UserProcessingPreferences" ADD COLUMN "speechLanguage" TEXT NOT NULL DEFAULT 'auto';
ALTER TABLE "UserProcessingPreferences" ADD COLUMN "customFillerWords" TEXT[] DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "UserProcessingPreferences" ADD COLUMN "customFillerPhrases" TEXT[] DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "UserProcessingPreferences" ADD COLUMN "speechCorrectionPreset" TEXT;
