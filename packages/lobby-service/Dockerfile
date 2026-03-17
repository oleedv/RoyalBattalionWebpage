FROM oven/bun:1 AS base
WORKDIR /app

# steamworks.js needs native build tools
RUN apt-get update && apt-get install -y python3 make g++ && rm -rf /var/lib/apt/lists/*

COPY package.json bun.lock* ./
RUN bun install --frozen-lockfile || bun install

COPY . .

ENV NODE_ENV=production
EXPOSE 3002
CMD ["bun", "run", "src/index.ts"]
