import { PrismaClient } from "@prisma/client";

let _client: PrismaClient | null = null;

export default function getSecretaryDb(): PrismaClient {
  if (!_client) {
    const url = process.env.SECRETARY_DATABASE_URL;
    if (!url) {
      throw new Error("SECRETARY_DATABASE_URL is not configured");
    }
    _client = new PrismaClient({
      datasources: {
        db: { url },
      },
    });
  }
  return _client;
}
