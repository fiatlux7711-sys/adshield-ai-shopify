import { PrismaClient } from "@prisma/client";

declare global {
  // eslint-disable-next-line no-var
  var prismaGlobal: PrismaClient;
}

/**
 * Passing datasourceUrl explicitly bypasses Prisma's own ambient .env
 * resolution for the datasource, so the value actually used is exactly
 * process.env.DATABASE_URL at construction time — nothing else.
 *
 * Without this, @prisma/client performs its own internal dotenv load when
 * the client is constructed, which can silently override an explicitly-set
 * process.env.DATABASE_URL with whatever a stray .env file in the working
 * directory contains. Confirmed empirically: setting
 * process.env.DATABASE_URL programmatically before constructing
 * PrismaClient() with no options still connected to the .env file's value
 * instead. Passing datasourceUrl removes that ambiguity for every
 * environment — local dev, tests, and production alike.
 */
function createClient() {
  return new PrismaClient({ datasourceUrl: process.env.DATABASE_URL });
}

if (process.env.NODE_ENV !== "production") {
  if (!global.prismaGlobal) global.prismaGlobal = createClient();
}

const prisma = global.prismaGlobal ?? createClient();
export default prisma;
