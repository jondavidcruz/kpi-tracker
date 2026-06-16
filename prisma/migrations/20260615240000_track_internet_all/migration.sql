-- Track internet speed for the whole team: low-speed + missing nags for everyone,
-- and every rep's daily speed recorded so weak KPIs can be correlated with it.
ALTER TABLE "User" ALTER COLUMN "tracksInternet" SET DEFAULT true;
UPDATE "User" SET "tracksInternet" = true WHERE "active" = true;
