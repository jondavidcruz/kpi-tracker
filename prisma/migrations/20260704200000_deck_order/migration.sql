-- Custom slide order + hidden slides for the Monday deck.
ALTER TABLE "Settings" ADD COLUMN "deckOrder" TEXT NOT NULL DEFAULT '';
ALTER TABLE "Settings" ADD COLUMN "deckHidden" TEXT NOT NULL DEFAULT '';
