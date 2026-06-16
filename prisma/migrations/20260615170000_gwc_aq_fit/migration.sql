-- Acquisitions seat fit (Gets it / Wants it / Capacity).
-- Ethan: capable & licensed, but part-time (~3 hrs every couple of days) and
-- inconsistent on lead follow-up — a Capacity and Wants-it gap for the AQ seat.
UPDATE "Seat" SET
  "gwcGet" = 'yes',
  "gwcWant" = 'no',
  "gwcCapacity" = 'no',
  "gwcNote" = 'Licensed and capable, but part-time (~3 hrs every couple of days) and does not always follow up with leads. Capacity and consistency are the gap for the acquisitions seat.'
WHERE "id" = 'seat_aq_ethan';

-- Michelle: full-time and the most motivated to close (5% commission is
-- significant in the Philippines) — strong fit for the acquisitions seat.
UPDATE "Seat" SET
  "gwcGet" = 'yes',
  "gwcWant" = 'yes',
  "gwcCapacity" = 'yes',
  "gwcNote" = 'Full-time and highly motivated to close leads (5% commission is significant in the Philippines). Strong fit for the acquisitions seat.'
WHERE "id" = 'seat_aq_michelle';
