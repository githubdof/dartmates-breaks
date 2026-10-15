import postgres from "postgres";
import type { Flight, Kit } from "../src/domain/flights";
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

/** Gives a signed-in host (by handle) a kit, creating their host_profiles row if it does not exist yet. */
export async function setKit(handle: string, k: Kit): Promise<void> {
  await withDb(async (sql) => {
    await sql`insert into host_profiles (user_id, kit_dark, kit_light)
      select id, ${k.dark}, ${k.light} from users where handle = ${handle}
      on conflict (user_id) do update set kit_dark = excluded.kit_dark, kit_light = excluded.kit_light`;
  });
}

/** Moves claims back in time, so lines past the payment window show overdue in host view (computed from now). */
export async function ageClaims(breakId: string, numbers: number[], hours: number): Promise<void> {
  await withDb(async (sql) => {
    await sql`update lines set claimed_at = now() - make_interval(hours => ${hours}::int)
      where break_id = ${breakId}::uuid and number in ${sql(numbers)}`;
  });
}
