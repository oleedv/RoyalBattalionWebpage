import SFTPClient from "ssh2-sftp-client";
import { generateAdminsCfg } from "./cfg-generator";
import prisma from "./db";

export async function triggerSftpDeploy(server?: string): Promise<void> {
  // If server is specified, deploy only that server; otherwise deploy all configured servers
  if (server) {
    await deployForServer(server);
  } else {
    const configs = await prisma.serverConfig.findMany({ where: { syncEnabled: true } });
    if (configs.length === 0) {
      // Fall back to env vars for backward compat (deploy all entries)
      await deployWithEnvVars();
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
    console.log(`[sftp-deploy] Sync disabled for server "${server}", skipping`);
    return;
  }

  const host = config.sftpHost;
  const port = config.sftpPort || 22;
  const username = config.sftpUser;
  const password = config.sftpPass;
  const remotePath = config.sftpPath;

  if (!host || !username || !password || !remotePath) {
    console.log(`[sftp-deploy] Incomplete SFTP config for server "${server}", skipping`);
    return;
  }

  const cfg = await generateAdminsCfg(server);
  const sftp = new SFTPClient();

  try {
    await sftp.connect({ host, port, username, password });
    await sftp.put(Buffer.from(cfg, "utf-8"), remotePath);
    console.log(`[sftp-deploy] Uploaded admins.cfg for server "${server}" successfully`);
  } finally {
    await sftp.end();
  }
}

async function deployWithEnvVars(server?: string): Promise<void> {
  const host = process.env.SFTP_HOST;
  const port = Number(process.env.SFTP_PORT) || 22;
  const username = process.env.SFTP_USER;
  const password = process.env.SFTP_PASS;
  const remotePath = process.env.SFTP_PATH;

  if (!host || !username || !password || !remotePath) {
    return;
  }

  const cfg = await generateAdminsCfg(server);
  const sftp = new SFTPClient();

  try {
    await sftp.connect({ host, port, username, password });
    await sftp.put(Buffer.from(cfg, "utf-8"), remotePath);
    console.log("[sftp-deploy] Uploaded admins.cfg successfully (env vars)");
  } finally {
    await sftp.end();
  }
}
