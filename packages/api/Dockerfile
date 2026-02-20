FROM oven/bun:1 AS base
WORKDIR /app

FROM base AS install
COPY package.json bun.lock ./
COPY packages/api/package.json ./packages/api/
COPY packages/shared/package.json ./packages/shared/
COPY prisma/ ./prisma/
RUN bun install --frozen-lockfile

FROM base AS build
COPY --from=install /app/node_modules ./node_modules
COPY --from=install /app/packages/api/node_modules ./packages/api/node_modules
COPY . .
RUN bunx prisma generate
RUN cd packages/api && bun run build

FROM base AS runtime
COPY --from=build /app/packages/api/dist ./dist
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/prisma ./prisma

ENV NODE_ENV=production
EXPOSE 3001
CMD ["bun", "run", "dist/index.js"]
