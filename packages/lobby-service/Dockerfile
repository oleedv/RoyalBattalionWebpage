FROM oven/bun:1 AS base
WORKDIR /app

FROM base AS install
# steamworks.js needs native build tools
RUN apt-get update && apt-get install -y python3 make g++ && rm -rf /var/lib/apt/lists/*
COPY package.json bun.lock ./
COPY packages/lobby-service/package.json ./packages/lobby-service/
RUN bun install

FROM base AS runtime
COPY --from=install /app/node_modules ./node_modules
COPY --from=install /app/packages/lobby-service/node_modules ./packages/lobby-service/node_modules
COPY packages/lobby-service/ ./packages/lobby-service/

ENV NODE_ENV=production
EXPOSE 3002
CMD ["bun", "run", "packages/lobby-service/src/index.ts"]
