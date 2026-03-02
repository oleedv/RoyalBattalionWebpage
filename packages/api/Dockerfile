FROM oven/bun:1 AS base
WORKDIR /app

FROM base AS install
RUN apt-get update && apt-get install -y python3 make g++ && rm -rf /var/lib/apt/lists/*
COPY package.json bun.lock ./
COPY packages/api/package.json ./packages/api/
COPY packages/shared/package.json ./packages/shared/
COPY prisma/ ./prisma/
COPY prisma.config.ts ./
RUN bun install

FROM base AS runtime
COPY --from=install /app/node_modules ./node_modules
COPY --from=install /app/packages/api/node_modules ./packages/api/node_modules
COPY --from=install /app/packages/shared/node_modules ./packages/shared/node_modules
COPY . .
RUN DATABASE_URL="mysql://build:build@localhost:3306/build" bunx prisma generate

ENV NODE_ENV=production
EXPOSE 3001
CMD ["bun", "run", "packages/api/src/index.ts"]
