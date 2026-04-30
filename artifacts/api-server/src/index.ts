import { serve } from "@hono/node-server";
import app from "./backend/hono";

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

serve(
  {
    fetch: app.fetch,
    port,
  },
  (info) => {
    console.log(`[API] RedLine API listening on port ${info.port}`);
  },
);
