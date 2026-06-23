-- Darel is Dalamar Homes' land-acquisitions agent, not a separate buyer.
-- Fold the duplicate "Darel" contact into the Dalamar Homes record, then delete it.
UPDATE "MarketContact" d SET
  "title"      = CASE WHEN d."title" = '' THEN 'Darel — Land Acquisitions' ELSE d."title" END,
  "phone"      = CASE WHEN d."phone" = '' THEN s."phone" ELSE d."phone" END,
  "phone2"     = CASE WHEN d."phone2" = '' THEN s."phone2" ELSE d."phone2" END,
  "email"      = CASE WHEN d."email" = '' THEN s."email" ELSE d."email" END,
  "website"    = CASE WHEN d."website" = '' THEN s."website" ELSE d."website" END,
  "vetStage"   = 'vetted',
  "outreachLog"= trim(both E'\n' from COALESCE(d."outreachLog",'') || E'\n' || COALESCE(s."outreachLog",''))
FROM "MarketContact" s
WHERE (d."id" = 'mc_vet_bc78a3dcce40' OR d."name" ILIKE '%dalamar%')
  AND s."name" ILIKE 'darel%' AND s."id" <> d."id";

DELETE FROM "MarketContact" WHERE "name" ILIKE 'darel%';
