import { Hono } from "npm:hono";
import { cors } from "npm:hono/cors";
import { logger } from "npm:hono/logger";
import * as kv from "./kv_store.tsx";
import notesRouter from "./notes.tsx";
import linksRouter from "./links.tsx";
import testRouter from "./test.tsx";
import initRouter from "./init.tsx";
import aiSearchRouter from "./ai-search.tsx";
import knowledgeDiscoveryRouter from "./knowledge-discovery.tsx";
import { ensureSystemUser } from "./db.tsx";

const app = new Hono();

// Initialize system user on startup
ensureSystemUser().catch(console.error);

// Enable logger
app.use('*', logger(console.log));

// Enable CORS for all routes and methods
app.use(
  "/*",
  cors({
    origin: "*",
    allowHeaders: ["Content-Type", "Authorization"],
    allowMethods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    exposeHeaders: ["Content-Length"],
    maxAge: 600,
  }),
);

// Health check endpoint
app.get("/make-server-fc3187a2/health", (c) => {
  return c.json({ status: "ok" });
});

// Mount routers
app.route("/make-server-fc3187a2/test", testRouter);
app.route("/make-server-fc3187a2/notes", notesRouter);
app.route("/make-server-fc3187a2/links", linksRouter);
app.route("/make-server-fc3187a2/init", initRouter);
app.route("/make-server-fc3187a2/ai-search", aiSearchRouter);
app.route("/make-server-fc3187a2/knowledge-discovery", knowledgeDiscoveryRouter);

Deno.serve(app.fetch);