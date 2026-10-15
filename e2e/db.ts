import postgres from "postgres";
import type { Flight } from "../src/domain/flights";
import { E2E_DATABASE_URL } from "./e2e-db";

/** One short connection per call to the e2e database, for state the UI cannot set quickly. Closed every time. */
export async function withDb<T>(fn: (sql: postgres.Sql) => Promise<T>): Promise<T> {
  const sql = postgres(E2E_DATABASE_URL, { max: 1, prepare: false });
  try {
    return await fn(sql);
  } finally {
    await sql.end();
  }
}

/** Gives a signed-in user (by handle) a known flight. `flight_chosen_at` stays null: it was not picked on /account. */
export async function setFlight(handle: string, f: Flight): Promise<void> {
  await withDb(async (sql) => { await sql`update users set flight_colour = ${f.colour}, flight_shape = ${f.shape} where handle = ${handle}`; });
}
