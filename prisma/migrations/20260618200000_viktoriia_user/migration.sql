-- Viktoriia had no User row (the earlier UPDATE-only matched nothing — her name
-- never started with "Viktoriia"), so she never appeared in Login & passwords.
-- Create her admin account if she doesn't exist under any spelling or her email.
INSERT INTO "User" ("id","name","email","role","position","note","irregularSchedule","tracksInternet","active","timezone","createdAt")
SELECT 'usr_viktoriia_arut','Viktoriia Arutiunova','viktoriia.arut@gmail.com','admin','','Marketing Director / Jon''s partner',true,false,true,'Europe/Prague',now()
WHERE NOT EXISTS (
  SELECT 1 FROM "User"
  WHERE lower("email") = 'viktoriia.arut@gmail.com'
     OR "name" ILIKE 'Vikt%' OR "name" ILIKE 'Victoria%'
);

-- And make sure whatever row represents her is an active admin.
UPDATE "User" SET "role" = 'admin', "active" = true
WHERE lower("email") = 'viktoriia.arut@gmail.com' OR "name" ILIKE 'Vikt%' OR "name" ILIKE 'Victoria%';
