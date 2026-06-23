-- "Signed — Listing" only applies to Ethan (listings), never Michelle (acquisitions).
-- Move the KPI into the listings role lane. The key is unchanged, so funnel /
-- benchmarks / meeting roll-ups that aggregate by key keep counting it.
UPDATE "Kpi" SET "roleKey" = 'listings' WHERE "key" = 'acq_signed_listing';
