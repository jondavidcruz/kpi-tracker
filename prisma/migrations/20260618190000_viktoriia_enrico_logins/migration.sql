-- Ensure Viktoriia + Enrico have login accounts (both admins, per Jon 2026-06-18)
-- so they appear in Admin → Login & passwords and Jon can set their passwords.
-- Pay access already works via their first names; this is about app access.

-- Viktoriia already exists as a User (roster linked to her) — just make her admin.
UPDATE "User" SET "role" = 'admin', "active" = true WHERE "name" ILIKE 'Viktoriia%';

-- Enrico was only a roster/seat entry, never a login — create his account if it
-- doesn't exist yet. (irregular schedule + no speed test: he's not hourly-tracked.)
INSERT INTO "User" ("id","name","email","role","position","note","irregularSchedule","tracksInternet","active","timezone","createdAt")
SELECT 'usr_enrico_cruz','Enrico Cruz','enricofcruz@gmail.com','admin','','Business partner / CFO',true,false,true,'America/Los_Angeles',now()
WHERE NOT EXISTS (SELECT 1 FROM "User" WHERE lower("email") = 'enricofcruz@gmail.com' OR "name" ILIKE 'Enrico%');

-- If Enrico already existed under another email, make sure he's an active admin.
UPDATE "User" SET "role" = 'admin', "active" = true WHERE "name" ILIKE 'Enrico%' OR lower("email") = 'enricofcruz@gmail.com';
