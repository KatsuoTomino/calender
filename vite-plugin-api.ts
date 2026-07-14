import type { Plugin, ViteDevServer } from "vite";
import type { IncomingMessage, ServerResponse } from "node:http";
import { loadEnv } from "vite";

type JsonRes = ServerResponse & {
  status: (code: number) => JsonRes;
  json: (data: unknown) => void;
};

async function readRawBody(req: IncomingMessage): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

function wrapResponse(res: ServerResponse): JsonRes {
  const r = res as JsonRes;
  r.status = (code: number) => {
    r.statusCode = code;
    return r;
  };
  r.json = (data: unknown) => {
    if (!r.writableEnded) {
      r.setHeader("Content-Type", "application/json; charset=utf-8");
      r.end(JSON.stringify(data));
    }
  };
  return r;
}

/**
 * Serves /api/* during Vite #dev by loading the same handlers used by Vercel.
 * vercel #dev currently proxies /api to Vite for this Vite project, so this
 * plugin is required for local image upload/display.
 */
export function localApiPlugin(): Plugin {
  return {
    name: "local-api",
    configureServer(server: ViteDevServer) {
      // Load R2_/VITE_ vars into process.env for API handlers
      const env = loadEnv(server.config.mode, server.config.root, "");
      Object.assign(process.env, env);

      server.middlewares.use(async (req, res, next) => {
        const urlPath = req.url?.split("?")[0] ?? "";
        if (!urlPath.startsWith("/api/")) {
          next();
          return;
        }

        // Avoid treating this as a Vite source module request
        try {
          const route = urlPath.replace(/^\/api\//, "").replace(/\/$/, "");
          if (!route || route.includes("..")) {
            res.statusCode = 404;
            res.end(JSON.stringify({ error: "Not found" }));
            return;
          }

          const modulePath = `/api/${route}.ts`;
          const mod = await server.ssrLoadModule(modulePath);
          const handler = mod.default;
          if (typeof handler !== "function") {
            res.statusCode = 500;
            res.end(JSON.stringify({ error: "Invalid API handler" }));
            return;
          }

          const vercelReq = req as IncomingMessage & {
            body?: unknown;
            query?: Record<string, string>;
            cookies?: Record<string, string>;
          };

          if (req.method !== "GET" && req.method !== "HEAD") {
            const raw = await readRawBody(req);
            const contentType = req.headers["content-type"] || "";
            if (contentType.includes("application/json")) {
              vercelReq.body = JSON.parse(raw.toString("utf8") || "{}");
            } else {
              vercelReq.body = raw;
            }
          }

          const url = new URL(req.url || "/", "http://localhost");
          vercelReq.query = Object.fromEntries(url.searchParams.entries());

          await handler(vercelReq, wrapResponse(res));
        } catch (error) {
          console.error("[local-api]", urlPath, error);
          if (!res.headersSent) {
            res.statusCode = 500;
            res.setHeader("Content-Type", "application/json; charset=utf-8");
            res.end(
              JSON.stringify({
                error: error instanceof Error ? error.message : "API error",
              })
            );
          }
        }
      });
    },
  };
}
