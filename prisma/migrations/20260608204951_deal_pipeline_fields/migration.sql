-- AlterTable
ALTER TABLE "Deal" ADD COLUMN     "contractExpiration" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "dealType" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "listingExpiration" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "listingSignedDate" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "lmAq" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "nextSteps" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "onMarketSince" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "source" TEXT NOT NULL DEFAULT '';
