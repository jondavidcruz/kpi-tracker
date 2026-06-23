-- Move "Offers Rejected" into the results flow, right under Contracts Signed.
UPDATE "Kpi" SET "category" = 'green' WHERE "key" = 'offers_rejected';
UPDATE "Kpi" SET "sortOrder" = 20 WHERE "key" = 'appts_set';
UPDATE "Kpi" SET "sortOrder" = 21 WHERE "key" = 'appts_taken';
UPDATE "Kpi" SET "sortOrder" = 22 WHERE "key" = 'offers_made';
UPDATE "Kpi" SET "sortOrder" = 23 WHERE "key" = 'acq_contracts_sent';
UPDATE "Kpi" SET "sortOrder" = 24 WHERE "key" = 'acq_signed_assignment';
UPDATE "Kpi" SET "sortOrder" = 25 WHERE "key" = 'acq_signed_novation';
UPDATE "Kpi" SET "sortOrder" = 26 WHERE "key" = 'acq_signed_creative';
UPDATE "Kpi" SET "sortOrder" = 27 WHERE "key" = 'contracts_signed';
UPDATE "Kpi" SET "sortOrder" = 28 WHERE "key" = 'offers_rejected';
