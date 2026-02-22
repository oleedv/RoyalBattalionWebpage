import { PrismaClient } from "../generated/prisma";
import { PrismaMariaDB } from "@prisma/adapter-mariadb";

const adapter = new PrismaMariaDB({
  connectionString: process.env.DATABASE_URL!,
});

const prisma = new PrismaClient({ adapter });

export default prisma;
