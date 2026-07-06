-- Onboarding ramp flag: restricts a user to learning + basics until certified.
ALTER TABLE "User" ADD COLUMN "onboarding" BOOLEAN NOT NULL DEFAULT false;
