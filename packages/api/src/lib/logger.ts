type LogLevel = "debug" | "info" | "warn" | "error";

function log(level: LogLevel, module: string, message: string, data?: unknown) {
  const timestamp = new Date().toISOString();
  const entry = { timestamp, level, module, message, ...(data !== undefined ? { data } : {}) };

  switch (level) {
    case "error":
      console.error(JSON.stringify(entry));
      break;
    case "warn":
      console.warn(JSON.stringify(entry));
      break;
    default:
      console.log(JSON.stringify(entry));
  }
}

export const logger = {
  debug: (module: string, message: string, data?: unknown) => log("debug", module, message, data),
  info: (module: string, message: string, data?: unknown) => log("info", module, message, data),
  warn: (module: string, message: string, data?: unknown) => log("warn", module, message, data),
  error: (module: string, message: string, data?: unknown) => log("error", module, message, data),
};
