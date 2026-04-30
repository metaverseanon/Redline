import { initTRPC } from "@trpc/server";
import { FetchCreateContextFnOptions } from "@trpc/server/adapters/fetch";
import superjson from "superjson";

import { getDbConfig } from "./db";

export const createContext = async (opts: FetchCreateContextFnOptions) => {
  const db = getDbConfig();

  console.log("[tRPC] createContext v1.1", {
    hasSupabaseUrl: !!db.url,
    hasAnonKey: !!db.anonKey,
    hasServiceRoleKey: !!db.serviceRoleKey,
    requestUrl: opts.req.url,
  });

  return {
    req: opts.req,
    db,
  };
};

export type Context = Awaited<ReturnType<typeof createContext>>;

const t = initTRPC.context<Context>().create({
  transformer: superjson,
});

export const createTRPCRouter = t.router;
export const publicProcedure = t.procedure;
