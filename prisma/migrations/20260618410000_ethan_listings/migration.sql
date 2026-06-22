-- Move Ethan off acquisitions to the dedicated listings role.
UPDATE "User" SET "position" = 'listings' WHERE "name" LIKE 'Ethan%' AND "position" = 'acquisitions';
