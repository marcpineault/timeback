-- AlterTable
ALTER TABLE "Script" ADD COLUMN     "headlineText" TEXT,
ADD COLUMN     "headlineClean" TEXT,
ADD COLUMN     "accentWords" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "openingLine" TEXT,
ADD COLUMN     "hookFormulaUsed" TEXT,
ADD COLUMN     "hookStrengthNotes" TEXT;
