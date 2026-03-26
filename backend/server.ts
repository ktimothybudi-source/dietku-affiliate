import { serve } from "@hono/node-server";
import app from "./hono";

const port = Number(process.env.PORT || 3000);

console.log(`[backend] starting on port ${port}`);

serve({
  fetch: app.fetch,
  port,
});
