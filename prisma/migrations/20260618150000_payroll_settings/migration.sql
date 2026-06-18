-- Biweekly payroll settings + payday-email recipients.
ALTER TABLE "Settings" ADD COLUMN IF NOT EXISTS "payCycleAnchor" TEXT NOT NULL DEFAULT '';
ALTER TABLE "Settings" ADD COLUMN IF NOT EXISTS "payrollEmails" TEXT NOT NULL DEFAULT '';
UPDATE "Settings" SET "payrollEmails" = 'jondavidcruz1@gmail.com, viktoriia.arut@gmail.com, enricofcruz@gmail.com'
  WHERE "id" = 1 AND "payrollEmails" = '';
