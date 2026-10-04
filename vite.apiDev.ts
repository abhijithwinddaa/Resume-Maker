/**
 * Serves the Vercel Functions in `api/` from the Vite dev server, so
 * `npm run dev` runs the whole app — no `vercel dev` or Vercel login needed.
 *
 * Routing mirrors Vercel's filesystem convention: `/api/ats/analyze` loads
 * `api/ats/analyze.ts`. Handlers go through Vite's SSR loader, so edits to a
 * handler or anything it imports apply on the next request without a restart.
 */
import { existsSync, readdirSync } from "node:fs";
import type { IncomingMessage, ServerResponse } from "node:http";
import path from "node:path";
import type { Plugin, ViteDevServer } from "vite";

type Handler = (req: unknown, res: unknown) => Promise<unknown> | unknown;

const API_PREFIX = "/api/";

/** Maps `/api/a/b?x=1` to `<root>/api/a/b.ts`, refusing anything outside `api/`. */
function resolveHandlerFile(root: string, url: string): string | null {
  const route = url.split("?")[0].slice(API_PREFIX.length);
  if (!route || !/^[a-z0-9/_-]+$/i.test(route)) return null;

  const apiDir = path.join(root, "api");
  const file = path.join(apiDir, `${route}.ts`);
  if (!file.startsWith(apiDir + path.sep) || !existsSync(file)) return null;
  return file;
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk: Buffer) => chunks.push(chunk));
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

async function handle(
  server: ViteDevServer,
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  const file = resolveHandlerFile(server.config.root, req.url ?? "");
  if (!file) {
    // As on Vercel — not Vite's SPA fallback serving index.html with a 200.
    res.statusCode = 404;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ error: "Not found." }));
    return;
  }

  try {
    const mod = await server.ssrLoadModule(file);
    const handler = mod.default as Handler | undefined;
    if (typeof handler !== "function") {
      throw new Error(
        `${path.relative(server.config.root, file)} has no default export`,
      );
    }

    const body = await readBody(req);
    // The handlers' Node adapter reads the body from `req.body`.
    Object.assign(req, { body: body || undefined });
    await handler(req, res);
  } catch (error) {
    server.ssrFixStacktrace(error as Error);
    console.error(`[api] ${req.method} ${req.url} failed:`, error);
    if (!res.headersSent) {
      res.statusCode = 500;
      res.setHeader("Content-Type", "application/json");
    }
    res.end(
      JSON.stringify({
        error: "Local API handler crashed — see the dev server log.",
      }),
    );
  }
}

/** Every handler file under `api/`, recursively. */
function listHandlerFiles(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return listHandlerFiles(full);
    return entry.name.endsWith(".ts") ? [full] : [];
  });
}

/**
 * Compile every handler once the server is up. Vite transforms a handler and
 * its whole import graph on first load, which makes the first API call of a
 * session take 30s+; doing it in the background moves that off the user.
 */
function warmUpHandlers(server: ViteDevServer): void {
  const files = listHandlerFiles(path.join(server.config.root, "api"));
  void Promise.allSettled(files.map((file) => server.ssrLoadModule(file)));
}

export function apiDevServer(): Plugin {
  return {
    name: "resume-maker:api-dev-server",
    apply: "serve",
    configureServer(server) {
      // Lets requestAuth accept the local dev sign-in. Only this dev server
      // process sets it; deployed functions never load this plugin.
      process.env.RESUME_MAKER_LOCAL_API = "1";
      server.middlewares.use((req, res, next) => {
        if (!req.url?.startsWith(API_PREFIX)) return next();
        void handle(server, req, res);
      });
      server.httpServer?.once("listening", () => warmUpHandlers(server));
    },
  };
}
