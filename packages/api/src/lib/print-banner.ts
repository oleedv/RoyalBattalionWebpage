import { execSync } from "node:child_process";
import os from "node:os";

const C = {
  reset: "\x1b[0m",
  bold: "\x1b[1m",
  dim: "\x1b[2m",
  gold: "\x1b[38;5;220m",
  red: "\x1b[31m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  cyan: "\x1b[36m",
  gray: "\x1b[90m",
  white: "\x1b[37m",
};

const LOGO = [
  "  ██████╗  ██████╗ ██╗   ██╗ █████╗ ██╗     ",
  "  ██╔══██╗██╔═══██╗╚██╗ ██╔╝██╔══██╗██║     ",
  "  ██████╔╝██║   ██║ ╚████╔╝ ███████║██║     ",
  "  ██╔══██╗██║   ██║  ╚██╔╝  ██╔══██║██║     ",
  "  ██║  ██║╚██████╔╝   ██║   ██║  ██║███████╗",
  "  ╚═╝  ╚═╝ ╚═════╝    ╚═╝   ╚═╝  ╚═╝╚══════╝",
  "  ██████╗  █████╗ ████████╗████████╗ █████╗ ██╗     ██╗ ██████╗ ███╗   ██╗",
  "  ██╔══██╗██╔══██╗╚══██╔══╝╚══██╔══╝██╔══██╗██║     ██║██╔═══██╗████╗  ██║",
  "  ██████╔╝███████║   ██║      ██║   ███████║██║     ██║██║   ██║██╔██╗ ██║",
  "  ██╔══██╗██╔══██║   ██║      ██║   ██╔══██║██║     ██║██║   ██║██║╚██╗██║",
  "  ██████╔╝██║  ██║   ██║      ██║   ██║  ██║███████╗██║╚██████╔╝██║ ╚████║",
  "  ╚═════╝ ╚═╝  ╚═╝   ╚═╝      ╚═╝   ╚═╝  ╚═╝╚══════╝╚═╝ ╚═════╝ ╚═╝  ╚═══╝",
];

const TIPS = [
  "Health endpoints: /health (DBs) and /live-server/health (SquadJS socket).",
  "admins.cfg is IP-allowlisted — set CFG_ALLOWED_IPS when a new puller joins.",
  "Two DBs: Prisma (website) + secretary-db (raw Discord-bot data, read-only).",
  "Live server state fans out over two WS endpoints: /live-server/ws and /presence/ws.",
  "Global error handler returns JSON for unhandled exceptions — AppError preserves status.",
  "Route groups mount under app.route('/…') — add new ones before the WS upgrade handler.",
  "Prefer logger.info('module', msg) — module tag makes prod logs greppable.",
  "bootstrap() runs role sync + match sync in the background — it never blocks boot.",
  "Use AppError for user-facing failures — it shapes the JSON and status automatically.",
  "Bun's WebSocket server is routed via the default fetch() export — not Hono middleware.",
];

function getGitInfo(): { commit: string | null; branch: string | null } {
  const envCommit = process.env.RAILWAY_GIT_COMMIT_SHA || process.env.GIT_COMMIT;
  const envBranch = process.env.RAILWAY_GIT_BRANCH || process.env.GIT_BRANCH;
  if (envCommit) return { commit: envCommit.slice(0, 7), branch: envBranch || null };
  try {
    const commit = execSync("git rev-parse --short HEAD", {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
      timeout: 500,
    }).trim();
    const branch = execSync("git rev-parse --abbrev-ref HEAD", {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
      timeout: 500,
    }).trim();
    return { commit, branch };
  } catch {
    return { commit: null, branch: null };
  }
}

function envTag(env: string): string {
  const up = (env || "development").toUpperCase();
  if (up.startsWith("PROD")) return `${C.red}${C.bold}[ ${up} ]${C.reset}`;
  if (up.startsWith("STAG")) return `${C.yellow}${C.bold}[ ${up} ]${C.reset}`;
  return `${C.green}${C.bold}[ ${up} ]${C.reset}`;
}

function pickTip(): string {
  return TIPS[Math.floor(Math.random() * TIPS.length)]!;
}

function label(text: string): string {
  return `${C.gray}${text.padEnd(9)}${C.reset}`;
}

function formatUptime(ms: number): string {
  const s = Math.floor(ms / 1000) % 60;
  const m = Math.floor(ms / 60000) % 60;
  const h = Math.floor(ms / 3600000);
  if (h) return `${h}h ${m}m ${s}s`;
  if (m) return `${m}m ${s}s`;
  return `${s}s`;
}

export function printStartupBanner(): void {
  const git = getGitInfo();
  const runtime = typeof Bun !== "undefined" ? `Bun ${Bun.version}` : `Node ${process.version}`;
  const env = process.env.NODE_ENV || "development";
  const version = process.env.npm_package_version || "unknown";
  const service = process.env.RAILWAY_SERVICE_NAME || "Webpage API";

  const out: string[] = [""];
  for (const row of LOGO) out.push(`${C.gold}${row}${C.reset}`);
  out.push("");
  out.push(`        ${C.bold}${C.white}── ${service} · Hono + Bun ──${C.reset}`);
  out.push("");
  out.push(`  ${label("Version")} ${C.white}${version}${C.reset}`);
  out.push(`  ${label("Env")} ${envTag(env)}`);
  out.push(`  ${label("Runtime")} ${runtime} ${C.dim}· ${os.platform()} ${os.release()}${C.reset}`);
  if (git.commit) {
    const br = git.branch ? ` ${C.dim}(${git.branch})${C.reset}` : "";
    out.push(`  ${label("Commit")} ${C.cyan}${git.commit}${C.reset}${br}`);
  }
  if (process.env.RAILWAY_DEPLOYMENT_ID) {
    out.push(`  ${label("Deploy")} ${C.dim}${process.env.RAILWAY_DEPLOYMENT_ID}${C.reset}`);
  }
  out.push(`  ${label("PID")} ${process.pid}`);
  out.push(`  ${label("Started")} ${new Date().toISOString().replace("T", " ").slice(0, 19)} UTC`);
  out.push("");
  out.push(`  ${C.gold}►${C.reset} ${C.dim}${pickTip()}${C.reset}`);
  out.push("");

  process.stdout.write(out.join("\n") + "\n");
}

export type ReadyInfo = {
  port: number;
  routeCount: number;
  wsEndpoints: string[];
  dbStatus: Record<string, boolean>;
  bootMs: number;
};

export function printReadyBanner(info: ReadyInfo): void {
  const out: string[] = [""];
  out.push(`  ${C.green}${C.bold}✓ READY${C.reset}  ${C.dim}boot ${info.bootMs}ms${C.reset}`);
  out.push(`  ${label("Port")} ${C.cyan}${info.port}${C.reset} ${C.dim}(http://localhost:${info.port})${C.reset}`);
  out.push(`  ${label("Routes")} ${info.routeCount}`);
  if (info.wsEndpoints.length > 0) {
    out.push(`  ${label("WS")} ${info.wsEndpoints.join(", ")}`);
  }
  for (const [name, ok] of Object.entries(info.dbStatus)) {
    const mark = ok ? `${C.green}ok${C.reset}` : `${C.red}fail${C.reset}`;
    out.push(`  ${label("DB:" + name)} ${mark}`);
  }
  out.push("");
  process.stdout.write(out.join("\n") + "\n");
}

export function printShutdownBanner(signal: string, startedAt: number): void {
  const uptime = formatUptime(Date.now() - startedAt);
  const service = process.env.RAILWAY_SERVICE_NAME || "Webpage API";
  process.stdout.write(
    `\n  ${C.gold}${service}${C.reset} — signing off on ${C.yellow}${signal}${C.reset} ${C.dim}(uptime ${uptime})${C.reset}\n\n`
  );
}
