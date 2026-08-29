/**
 * Generates the production PostgreSQL schema from the canonical SQLite schema.
 *
 *   npm run db:gen-pg        # write prisma/schema.postgresql.prisma
 *   npm run db:gen-pg -- --check   # exit 1 if the generated file is stale
 *
 * Keeping one source of truth avoids the classic failure where dev and
 * production schemas silently diverge. The model block is copied verbatim;
 * only the datasource header differs.
 */
import fs from "fs";

const SOURCE = "prisma/schema.prisma";
const TARGET = "prisma/schema.postgresql.prisma";

const HEADER = `// GENERATED FILE — DO NOT EDIT BY HAND.
//
// Produced from prisma/schema.prisma by scripts/gen-pg-schema.mjs.
// Edit the models in prisma/schema.prisma, then run: npm run db:gen-pg
//
// Production PostgreSQL schema. Used with:
//   npx prisma migrate deploy --schema prisma/schema.postgresql.prisma

generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}
`;

const source = fs.readFileSync(SOURCE, "utf8");

// Drop the leading comment block, the generator block, and the datasource
// block; keep every model/enum definition exactly as written.
const modelStart = source.search(/^(model|enum)\s/m);
if (modelStart === -1) {
  console.error(`No model or enum definitions found in ${SOURCE}`);
  process.exit(1);
}

const generated = `${HEADER}\n${source.slice(modelStart).trimEnd()}\n`;

if (process.argv.includes("--check")) {
  const current = fs.existsSync(TARGET) ? fs.readFileSync(TARGET, "utf8") : "";
  if (current !== generated) {
    console.error(
      `${TARGET} is out of date with ${SOURCE}.\n` +
        `The dev and production schemas have drifted. Run: npm run db:gen-pg`,
    );
    process.exit(1);
  }
  console.log(`${TARGET} is in sync with ${SOURCE}.`);
  process.exit(0);
}

fs.writeFileSync(TARGET, generated);
console.log(`Wrote ${TARGET} from ${SOURCE}.`);
