#!/bin/sh
echo "[entrypoint] Pushing schema to database (30s timeout)..."
timeout 30 bunx prisma db push --skip-generate || echo "[entrypoint] WARNING: prisma db push failed or timed out, starting server anyway"
echo "[entrypoint] Starting API server..."
exec bun run packages/api/src/index.ts
