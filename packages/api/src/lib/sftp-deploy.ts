import SFTPClient from "ssh2-sftp-client";
import { generateAdminsCfg } from "./cfg-generator";

export async function triggerSftpDeploy(): Promise<void> {
  const host = process.env.SFTP_HOST;
  const port = Number(process.env.SFTP_PORT) || 22;
  const username = process.env.SFTP_USER;
  const password = process.env.SFTP_PASS;
  const remotePath = process.env.SFTP_PATH;

  if (!host || !username || !password || !remotePath) {
    return;
  }

  const cfg = await generateAdminsCfg();
  const sftp = new SFTPClient();

  try {
    await sftp.connect({ host, port, username, password });
    await sftp.put(Buffer.from(cfg, "utf-8"), remotePath);
    console.log("[sftp-deploy] Uploaded admins.cfg successfully");
  } finally {
    await sftp.end();
  }
}
