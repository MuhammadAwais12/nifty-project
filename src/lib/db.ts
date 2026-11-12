import postgres from 'postgres';
import { SCHEMA } from '@/server/schema';

const g = globalThis as any;

export class HttpError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

/** Shared Postgres client. Works with Neon, Supabase, Vercel Postgres or any Postgres. */
export function db(): postgres.Sql<any> {
  if (!g.__tt_sql) {
    const url = process.env.DATABASE_URL || process.env.POSTGRES_URL;
    if (!url) {
      throw new HttpError(
        500,
        'No database connected. Add a Postgres database and set DATABASE_URL in your Vercel project settings, then redeploy.'
      );
    }
    const local = /@(localhost|127\.0\.0\.1)/.test(url);
    g.__tt_sql = postgres(url, {
      ssl: local ? false : 'require',
      prepare: false, // required for pooled connections (Neon pooler, Supabase pgbouncer)
      // one connection per serverless instance: many lambdas each holding a pool
      // is what exhausts a Neon or Supabase connection limit and takes the app down
      max: process.env.VERCEL ? 1 : 10,
      idle_timeout: 20,
      connect_timeout: 15,
      onnotice: () => {},
      types: {
        // keep DATE columns as plain 'YYYY-MM-DD' strings (no timezone shifting)
        date: { to: 1082, from: [1082], serialize: (x: string) => x, parse: (x: string) => x },
      },
    });
  }
  return g.__tt_sql;
}

/** Creates all tables on first use, so there is no separate migration step. */
export function ready(): Promise<void> {
  if (!g.__tt_ready) {
    g.__tt_ready = db()
      .begin(async (tx: any) => {
        await tx`select pg_advisory_xact_lock(74201)`;
        await tx.unsafe(SCHEMA);
      })
      .then(() => undefined)
      .catch((e: any) => {
        g.__tt_ready = null;
        throw e;
      });
  }
  return g.__tt_ready;
}
