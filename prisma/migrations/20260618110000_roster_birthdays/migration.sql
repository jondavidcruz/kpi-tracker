-- Birthdays: Viktoriia, Ethan; add Jon's owner profile. (Sharyn already 2000-02-07.)
UPDATE "TeamProfile" tp SET "birthday" = '1997-11-02', "updatedAt" = now()
FROM "User" u WHERE tp."userId" = u.id AND u."name" ILIKE 'Viktoriia%';

UPDATE "TeamProfile" tp SET "birthday" = '2000-04-24', "updatedAt" = now()
FROM "User" u WHERE tp."userId" = u.id AND u."name" ILIKE 'Ethan%';

INSERT INTO "TeamProfile" ("id","userId","name","birthday","phone","address","startDate","lastPromotion","payScale","payPeriod","payMethod","payDetails","about","performance","updatedAt")
SELECT 'tp_jon', u.id, 'Jon Cruz', '1992-03-26', '', '', '', '', '', '', '', '', 'Owner / CEO of Freedom Offers.', '', now()
FROM "User" u WHERE u."name" ILIKE 'Jon%' ORDER BY u."createdAt" LIMIT 1
ON CONFLICT ("userId") DO UPDATE SET "birthday" = EXCLUDED."birthday", "name" = EXCLUDED."name", "updatedAt" = now();
