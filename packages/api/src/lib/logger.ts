import pino, { type Logger } from "pino";
import { AsyncLocalStorage } from "node:async_hooks";

export type LogContext = {
  requestId?: string;
  userId?: string;
  userName?: string;
  apiTokenId?: string;
  ip?: string;
  userAgent?: string;
};

export const logContext = new AsyncLocalStorage<LogContext>();

const isProd = process.env.NODE_ENV === "production";
const level = process.env.LOG_LEVEL ?? (isProd ? "info" : "debug");

const base: Record<string, string> = {
  service: process.env.RAILWAY_SERVICE_NAME ?? "api",
  env: process.env.RAILWAY_ENVIRONMENT_NAME ?? process.env.NODE_ENV ?? "dev",
};
if (process.env.RAILWAY_DEPLOYMENT_ID) base.deployId = process.env.RAILWAY_DEPLOYMENT_ID;
if (process.env.RAILWAY_GIT_COMMIT_SHA) base.commit = process.env.RAILWAY_GIT_COMMIT_SHA;

const rootLogger: Logger = pino({
  level,
  base,
  serializers: { err: pino.stdSerializers.err },
  timestamp: pino.stdTimeFunctions.isoTime,
  ...(isProd
    ? {}
    : {
        transport: {
          target: "pino-pretty",
          options: {
            colorize: true,
            translateTime: "HH:MM:ss.l",
            ignore: "pid,hostname,service,env,deployId,commit",
            messageFormat: "[{module}] {msg}",
          },
        },
      }),
});

export function serializeError(err: unknown) {
  if (err instanceof Error) return pino.stdSerializers.err(err);
  return err;
}

function isError(x: unknown): x is Error {
  return x instanceof Error;
}

function getBoundLogger(): Logger {
  const ctx = logContext.getStore();
  if (!ctx) return rootLogger;
  return rootLogger.child(ctx);
}

type Level = "debug" | "info" | "warn" | "error";

function emit(level: Level, module: string, message: string, data?: unknown) {
  const l = getBoundLogger();
  if (data === undefined) {
    l[level]({ module }, message);
    return;
  }
  if (isError(data)) {
    l[level]({ module, err: data }, message);
    return;
  }
  if (typeof data === "object" && data !== null) {
    const d = data as Record<string, unknown>;
    const errCandidate = d.err ?? d.error;
    if (isError(errCandidate)) {
      const { err: _omitErr, error: _omitError, ...rest } = d;
      l[level]({ module, err: errCandidate, ...rest }, message);
      return;
    }
    l[level]({ module, ...d }, message);
    return;
  }
  l[level]({ module, data }, message);
}

export const logger = {
  debug: (module: string, message: string, data?: unknown) => emit("debug", module, message, data),
  info: (module: string, message: string, data?: unknown) => emit("info", module, message, data),
  warn: (module: string, message: string, data?: unknown) => emit("warn", module, message, data),
  error: (module: string, message: string, data?: unknown) => emit("error", module, message, data),
};

export function runWithContext<T>(ctx: LogContext, fn: () => T): T {
  return logContext.run(ctx, fn);
}

export function updateContext(patch: Partial<LogContext>) {
  const current = logContext.getStore();
  if (current) Object.assign(current, patch);
}
