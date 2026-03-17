FROM oven/bun:1 AS base
WORKDIR /app

FROM base AS install
# steamworks.js needs native build tools
RUN apt-get update && apt-get install -y python3 make g++ && rm -rf /var/lib/apt/lists/*
COPY package.json bun.lock ./
COPY packages/lobby-service/package.json ./packages/lobby-service/
RUN bun install

FROM debian:bookworm-slim AS steam
# Install SteamCMD and extract steamclient.so
RUN dpkg --add-architecture i386 && \
    apt-get update && \
    apt-get install -y lib32gcc-s1 curl ca-certificates && \
    mkdir -p /steamcmd && \
    curl -sqL "https://steamcdn-a.akamaihd.net/client/installer/steamcmd_linux.tar.gz" | tar xzf - -C /steamcmd && \
    /steamcmd/steamcmd.sh +@sSteamCmdForcePlatformType linux +login anonymous +quit || true && \
    cp /root/.steam/steamcmd/linux64/steamclient.so /steamclient.so && \
    rm -rf /var/lib/apt/lists/*

FROM base AS runtime
# Steam client library for steamworks.js
RUN mkdir -p /root/.steam/sdk64
COPY --from=steam /steamclient.so /root/.steam/sdk64/steamclient.so

COPY --from=install /app/node_modules ./node_modules
COPY --from=install /app/packages/lobby-service/node_modules ./packages/lobby-service/node_modules
COPY packages/lobby-service/ ./packages/lobby-service/

# steam_appid.txt must be in cwd for SteamAPI_Init
COPY packages/lobby-service/steam_appid.txt ./steam_appid.txt

ENV NODE_ENV=production
EXPOSE 3002
CMD ["bun", "run", "packages/lobby-service/src/index.ts"]
