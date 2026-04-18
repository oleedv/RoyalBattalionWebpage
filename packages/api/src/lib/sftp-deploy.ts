import SFTPClient from "ssh2-sftp-client";
import { generateAdminsCfg } from "./cfg-generator";
import prisma from "./db";
import { decrypt } from "./crypto";
import { env } from "./env";
import { logger } from "./logger";

export async function triggerSftpDeploy(server?: string): Promise<void> {
  // If server is specified, deploy only that server; otherwise deploy all configured servers
  if (server) {
    await deployForServer(server);
  } else {
    const configs = await prisma.serverConfig.findMany({ where: { syncEnabled: true } });
    if (configs.length === 0) {
      // Fall back to env vars only if SFTP_SYNC_ENABLED is explicitly set
      if (env.SFTP_SYNC_ENABLED === "true") {
        await deployWithEnvVars();
      }
      return;
    }
    for (const config of configs) {
      await deployForServer(config.server);
    }
  }
}

async function deployForServer(server: string): Promise<void> {
  const config = await prisma.serverConfig.findUnique({ where: { server } });

  if (!config) {
    // Fall back to env vars
    await deployWithEnvVars(server);
    return;
  }

  if (!config.syncEnabled) {
    logger.info("sftp", `Sync disabled for server "${server}", skipping`);
    return;
  }

  const host = config.sftpHost;
  const port = config.sftpPort || 22;
  const username = config.sftpUser;
  const password = config.sftpPass ? decrypt(config.sftpPass) : null;
  const remotePath = config.sftpPath;

  if (!host || !username || !password || !remotePath) {
    logger.info("sftp", `Incomplete SFTP config for server "${server}", skipping`);
    return;
  }

  const cfg = await generateAdminsCfg(server);
  const sftp = new SFTPClient();
  const filePath = normalizeSftpPath(remotePath);
  const started = performance.now();
  logger.info("sftp", "Deploy start", { server, host, port, filePath, bytes: Buffer.byteLength(cfg, "utf-8") });

  try {
    await sftp.connect({ host, port, username, password });
    await sftp.put(Buffer.from(cfg, "utf-8"), filePath);
    const duration_ms = Math.round(performance.now() - started);
    logger.info("sftp", "Deploy success", { server, host, filePath, duration_ms });
  } catch (err) {
    const duration_ms = Math.round(performance.now() - started);
    logger.error("sftp", "Deploy failed", { server, host, port, filePath, duration_ms, err });
    throw err;
  } finally {
    try {
      await sftp.end();
    } catch (err) {
      logger.warn("sftp", "Failed to close SFTP connection", { server, host, err });
    }
  }
}

async function deployWithEnvVars(server?: string): Promise<void> {
  const host = env.SFTP_HOST;
  const port = env.SFTP_PORT;
  const username = env.SFTP_USER;
  const password = env.SFTP_PASS;
  const remotePath = env.SFTP_PATH;

  if (!host || !username || !password || !remotePath) {
    return;
  }

  const cfg = await generateAdminsCfg(server);
  const sftp = new SFTPClient();
  const filePath = normalizeSftpPath(remotePath);
  const started = performance.now();
  logger.info("sftp", "Deploy start (env vars)", { server: server ?? null, host, port, filePath, bytes: Buffer.byteLength(cfg, "utf-8") });

  try {
    await sftp.connect({ host, port, username, password });
    await sftp.put(Buffer.from(cfg, "utf-8"), filePath);
    const duration_ms = Math.round(performance.now() - started);
    logger.info("sftp", "Deploy success (env vars)", { server: server ?? null, host, filePath, duration_ms });
  } catch (err) {
    const duration_ms = Math.round(performance.now() - started);
    logger.error("sftp", "Deploy failed (env vars)", { server: server ?? null, host, port, filePath, duration_ms, err });
    throw err;
  } finally {
    try {
      await sftp.end();
    } catch (err) {
      logger.warn("sftp", "Failed to close SFTP connection", { server: server ?? null, host, err });
    }
  }
}

function normalizeSftpPath(path: string): string {
  if (path.endsWith("/Admins.cfg")) return path;
  return path.replace(/\/+$/, "") + "/Admins.cfg";
}
