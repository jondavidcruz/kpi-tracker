-- Assessment results (Predictive Index / IQ / EI) on Accountability Chart seats.
ALTER TABLE "Seat" ADD COLUMN IF NOT EXISTS "piProfile" TEXT NOT NULL DEFAULT '';
ALTER TABLE "Seat" ADD COLUMN IF NOT EXISTS "piTagline" TEXT NOT NULL DEFAULT '';
ALTER TABLE "Seat" ADD COLUMN IF NOT EXISTS "piSummary" TEXT NOT NULL DEFAULT '';
ALTER TABLE "Seat" ADD COLUMN IF NOT EXISTS "iq" TEXT NOT NULL DEFAULT '';
ALTER TABLE "Seat" ADD COLUMN IF NOT EXISTS "ei" TEXT NOT NULL DEFAULT '';
ALTER TABLE "Seat" ADD COLUMN IF NOT EXISTS "assessedOn" TEXT NOT NULL DEFAULT '';
ALTER TABLE "Seat" ADD COLUMN IF NOT EXISTS "roleFit" TEXT NOT NULL DEFAULT '';

-- Jon — Strategist (on the Visionary seat)
UPDATE "Seat" SET
  "piProfile" = 'Strategist',
  "piTagline" = 'Results-oriented, innovative and analytical with a drive for change.',
  "piSummary" = 'Intense self-starter; independent, technically-oriented, high personal standards; reserved socially.',
  "assessedOn" = 'Jan 2024',
  "roleFit" = 'Strong fit — Strategist maps directly to the Visionary / Integrator seat: drives change, sets direction, decisive and analytical.'
WHERE "id" = 'seat_visionary';

UPDATE "Seat" SET
  "roleFit" = 'Same person as Visionary — the Strategist profile also fits the Integrator seat (drives execution, decisive, holds the standard).'
WHERE "id" = 'seat_integrator';

-- Marie — no PI on file yet; IQ 116
UPDATE "Seat" SET
  "iq" = '116',
  "roleFit" = 'Predictive Index not on file yet — take it before confirming the Acquisitions / Dispositions management grooming track, so the fit is evidence-based.'
WHERE "id" = 'seat_ops';

-- Sharyn — Specialist
UPDATE "Seat" SET
  "piProfile" = 'Specialist',
  "piTagline" = 'A highly precise worker who remains skeptical while respecting authority.',
  "piSummary" = 'Conscientious, detail-oriented, risk-averse, by-the-book; reserved; works autonomously in her specialty; prefers the proven way.',
  "assessedOn" = 'Jan 2024',
  "roleFit" = 'Partial fit — excellent for dispositions transaction management, follow-through and accuracy; but a Specialist is cautious and risk-averse, not a naturally driving / assertive closer or change-driver. Pair the seat with a clear closing playbook and urgency targets (or a driving counterpart) for the manager dimension.'
WHERE "id" = 'seat_dispo';

-- Michelle — no PI on file yet
UPDATE "Seat" SET
  "roleFit" = 'Predictive Index not on file yet — take it next. Field performance is the strongest on the team, so confirming the seat with data is worthwhile.'
WHERE "id" = 'seat_aq_michelle';

-- Ethan — Strategist
UPDATE "Seat" SET
  "piProfile" = 'Strategist',
  "piTagline" = 'Results-oriented, innovative and analytical with a drive for change.',
  "piSummary" = 'Task / technically-focused, independent, reserved socially, by-the-book; little interest in small talk; impatient with routine.',
  "assessedOn" = 'Sep 2025',
  "roleFit" = 'Misaligned for front-line acquisitions follow-up — a Strategist is operationally / task-focused and reserved, not built for high-volume relationship follow-up (this corroborates the lead-follow-up gap). Better suited to licensed deal-structuring, negotiation and analysis. Reshape the seat around his license, not front-line follow-up.'
WHERE "id" = 'seat_aq_ethan';

-- Viktoriia — Altruist; IQ 136
UPDATE "Seat" SET
  "piProfile" = 'Altruist',
  "piTagline" = 'Congenial and cooperative with an efficient, precise work ethic.',
  "piSummary" = 'Socially-focused, empathetic, extraverted communicator; team-oriented and accommodating; detail-oriented but impatient with repetitive routine.',
  "iq" = '136',
  "assessedOn" = 'Jan 2024',
  "roleFit" = 'Good fit — the relational, communicative side of marketing suits an Altruist (motivates, communicates programs well). Caution: impatient with repetitive routine, so structure the campaign grind and lean on systems / automation.'
WHERE "id" = 'seat_marketing';

-- Enrico — Analyzer
UPDATE "Seat" SET
  "piProfile" = 'Analyzer',
  "piTagline" = 'Intense, with high standards and a disciplined and reserved personality.',
  "piSummary" = 'Technically (not socially) oriented; detail-oriented, precise, analytical; cautious with risk decisions outside his expertise.',
  "assessedOn" = 'Jan 2024',
  "roleFit" = 'Strong fit — Analyzer is ideal for a finance / CFO seat: disciplined, precise, analytical, high standards. Well-aligned as a passive, financials-only partner.'
WHERE "id" = 'seat_cfo';
