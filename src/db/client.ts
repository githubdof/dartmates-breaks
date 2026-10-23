import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";
import { env } from "@/lib/env";

// transaction-mode pooler: no prepared statements, no session state
const sql = postgres(env().DATABASE_URL, { prepare: false, max: 10 });
export const db = drizzle(sql, { schema });
export type Db = typeof db;
export type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];

/** Runs `fn` in a transaction; the cleanup job and the hide script take one so tests can run them inside theirs. */
export type TxRunner = <T>(fn: (tx: Tx) => Promise<T>) => Promise<T>;
/** A fresh transaction on the app's pool, committed when `fn` resolves. */
export const inTransaction: TxRunner = (fn) => db.transaction(fn);
