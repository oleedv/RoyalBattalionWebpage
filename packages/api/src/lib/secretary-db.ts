import { PrismaClient } from "@prisma/client";

const secretaryDb = new PrismaClient({
  datasources: {
    db: {
      url: process.env.SECRETARY_DATABASE_URL,
    },
  },
});

export default secretaryDb;
