import { PrismaClient } from "../generated/prisma/client";
import { PrismaMariaDb } from "@prisma/adapter-mariadb";
import { env } from "./env";

let _client: PrismaClient | null = null;

export default function getSecretaryDb(): PrismaClient {
  if (!_client) {
    const url = env.SECRETARY_DATABASE_URL;
    if (!url) {
      throw new Error("SECRETARY_DATABASE_URL is not configured");
    }
    const adapter = new PrismaMariaDb(url);
    _client = new PrismaClient({ adapter });
  }
  return _client;
}

/** Destroy the cached client so the next call to getSecretaryDb() creates a fresh connection pool. */
export function resetSecretaryDb(): void {
  if (_client) {
    _client.$disconnect().catch(() => {});
    _client = null;
  }
}
