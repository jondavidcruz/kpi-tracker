-- Training-review signals on a scored call: star rating + "used for training" flag.
ALTER TABLE "CallScore" ADD COLUMN "reviewStars" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "CallScore" ADD COLUMN "usedForTraining" BOOLEAN NOT NULL DEFAULT false;
