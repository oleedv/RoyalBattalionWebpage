import { PrismaClient } from "../generated/prisma/client";
import { PrismaMariaDb } from "@prisma/adapter-mariadb";

let _client: PrismaClient | null = null;

export default function getSecretaryDb(): PrismaClient {
  if (!_client) {
    const url = process.env.SECRETARY_DATABASE_URL;
    if (!url) {
      throw new Error("SECRETARY_DATABASE_URL is not configured");
    }
    const adapter = new PrismaMariaDb(url);
    _client = new PrismaClient({ adapter });
  }
  return _client;
}
