-- Correct Viktoriia's surname: she is Jon's wife → Viktoriia Cruz (not Arutiunova).
UPDATE "User" SET "name" = 'Viktoriia Cruz'
WHERE lower("email") = 'viktoriia.arut@gmail.com' OR "name" ILIKE 'Viktoriia%';

UPDATE "TeamProfile" SET "name" = 'Viktoriia Cruz'
WHERE "name" ILIKE 'Viktoriia%';
