#!/bin/sh
echo "[entrypoint] Pushing schema to database..."
bunx prisma db push --skip-generate
echo "[entrypoint] Starting API server..."
exec bun run packages/api/src/index.ts
