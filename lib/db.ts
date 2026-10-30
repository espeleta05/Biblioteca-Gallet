import { Pool } from "pg";

declare global {
  // eslint-disable-next-line no-var
  var sigebPool: Pool | undefined;
}

export const pool =
  global.sigebPool ??
  new Pool({
    connectionString: process.env.DATABASE_URL,
  });

if (process.env.NODE_ENV !== "production") {
  global.sigebPool = pool;
}
