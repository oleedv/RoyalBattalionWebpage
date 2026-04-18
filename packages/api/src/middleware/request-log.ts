import { createMiddleware } from "hono/factory";
import { logContext, logger, type LogContext } from "../lib/logger";

function getClientIp(c: { req: { header: (name: string) => string | undefined } }): string {
  return (
    c.req.header("x-forwarded-for")?.split(",")[0]?.trim() ||
    c.req.header("x-real-ip") ||
    "unknown"
  );
}

const SKIP_PATHS = new Set(["/health", "/live-server/health"]);

export function requestLog() {
  return createMiddleware(async (c, next) => {
    const requestId = c.req.header("x-request-id") ?? crypto.randomUUID();
    c.header("X-Request-Id", requestId);

    const ctx: LogContext = {
      requestId,
      ip: getClientIp(c),
      userAgent: c.req.header("user-agent"),
    };

    const started = performance.now();
    const method = c.req.method;
    const path = c.req.path;

    await logContext.run(ctx, async () => {
      try {
        await next();
      } finally {
        const duration_ms = Math.round((performance.now() - started) * 10) / 10;
        const status = c.res.status;
        const level = status >= 500 ? "error" : status >= 400 ? "warn" : "info";
        const finalLevel = SKIP_PATHS.has(path) ? "debug" : level;
        logger[finalLevel]("http", `${method} ${path} ${status}`, {
          method,
          path,
          status,
          duration_ms,
        });
      }
    });
  });
}
