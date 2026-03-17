FROM oven/bun:1 AS base
WORKDIR /app

FROM base AS install
# steamworks.js needs native build tools
RUN apt-get update && apt-get install -y python3 make g++ && rm -rf /var/lib/apt/lists/*
COPY package.json bun.lock ./
COPY packages/lobby-service/package.json ./packages/lobby-service/
RUN bun install

FROM cm2network/steamcmd:root AS steam
# Run SteamCMD once to ensure client libs are downloaded
RUN /home/steam/steamcmd/steamcmd.sh +login anonymous +quit || true

FROM base AS runtime
# Steam client library for steamworks.js
RUN mkdir -p /root/.steam/sdk64
COPY --from=steam /home/steam/steamcmd/linux64/steamclient.so /root/.steam/sdk64/steamclient.so

COPY --from=install /app/node_modules ./node_modules
COPY --from=install /app/packages/lobby-service/node_modules ./packages/lobby-service/node_modules
COPY packages/lobby-service/ ./packages/lobby-service/

# steam_appid.txt must be in cwd for SteamAPI_Init
COPY packages/lobby-service/steam_appid.txt ./steam_appid.txt

ENV NODE_ENV=production
EXPOSE 3002
CMD ["bun", "run", "packages/lobby-service/src/index.ts"]
