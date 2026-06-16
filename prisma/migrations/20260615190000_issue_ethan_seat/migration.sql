-- Queue Ethan's seat-fit as an open issue for the Level 10 (Identify, Discuss, Solve).
INSERT INTO "Issue" ("id","title","detail","raisedBy","owner","priority","scope","status","solveNote")
VALUES (
  'issue_ethan_seat',
  'Right person, wrong seat: Ethan in front-line acquisitions',
  'Ethan''s Predictive Index (Strategist) and current capacity (part-time, ~3 hrs every couple of days, inconsistent lead follow-up) make him a poor fit for high-volume front-line lead follow-up — but his real-estate license is valuable. Decide how to reshape the seat: e.g. move him to licensed deal-structuring / negotiation / closing support and off front-line follow-up, and confirm hours + expectations. See his role-fit note on the Accountability Chart.',
  'Jon Cruz',
  'Jon Cruz',
  1,
  'leadership',
  'open',
  ''
)
ON CONFLICT ("id") DO NOTHING;
