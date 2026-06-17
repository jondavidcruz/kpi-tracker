-- Acknowledge is gone — alerts must be justified + resolved. Any previously
-- acknowledged alerts return to "open" so they get a documented reason.
UPDATE "Alert" SET "status" = 'open' WHERE "status" = 'ack';
