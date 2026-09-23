import { PrismaClient } from "@prisma/client";

// Buyer data is NEVER deleted — archive only (vetted-buyers rebuild rule zero).
// This client-level guard throws on any delete/deleteMany against buyer tables,
// belt-and-braces on top of the archive-only server actions and the RESTRICT
// foreign keys in the migration.
const NO_DELETE = new Set(["MarketContact", "BuyerHistory", "BuyerContact", "BuyerTouch"]);

function makeClient() {
  return new PrismaClient().$extends({
    query: {
      $allModels: {
        delete({ model, args, query }) {
          if (NO_DELETE.has(model)) throw new Error(`Deletes are disabled for ${model} — archive instead (rule zero).`);
          return query(args);
        },
        deleteMany({ model, args, query }) {
          if (NO_DELETE.has(model)) throw new Error(`Deletes are disabled for ${model} — archive instead (rule zero).`);
          return query(args);
        },
      },
    },
  });
}

type Db = ReturnType<typeof makeClient>;

// Reuse a single client across hot reloads in dev.
const globalForPrisma = globalThis as unknown as { prisma?: Db };

export const db = globalForPrisma.prisma ?? makeClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = db;
