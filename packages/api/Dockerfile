FROM oven/bun:1 AS base
WORKDIR /app

FROM base AS install
COPY package.json bun.lock ./
COPY packages/api/package.json ./packages/api/
COPY packages/shared/package.json ./packages/shared/
COPY prisma/ ./prisma/
RUN bun install

FROM base AS runtime
COPY --from=install /app/node_modules ./node_modules
COPY . .
RUN bunx prisma generate

ENV NODE_ENV=production
EXPOSE 3001
CMD ["sh", "-c", "bunx prisma db push && bun run packages/api/src/index.ts"]
