-- AlterTable
ALTER TABLE "Deal" ADD COLUMN     "assignmentFee" DOUBLE PRECISION;

-- AlterTable
ALTER TABLE "Settings" ADD COLUMN     "annualRevenueGoal" DOUBLE PRECISION NOT NULL DEFAULT 0;
