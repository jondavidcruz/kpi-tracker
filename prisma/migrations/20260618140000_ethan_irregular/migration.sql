-- Ethan is part-time (<9 hrs/week, no set schedule) — exclude from schedule board + time card.
UPDATE "User" SET "irregularSchedule" = true WHERE "name" ILIKE 'Ethan%';
