# Security Audit Report -- Royal Battalion API

**Date:** 2026-02-24
**Scope:** Full API (`packages/api`), frontend (`packages/web`), shared types, infrastructure (Docker)
**Methodology:** Manual source code review

---

## Executive Summary

The Royal Battalion API is a well-structured Hono/Bun application with solid security fundamentals: Zod input validation, Prisma ORM (parameterized queries), JWT authentication, granular RBAC, AES-256-GCM encryption, audit logging, and rate limiting. This audit identified **15 findings** across 4 severity levels. The most critical issues relate to default-allow behavior on the `/admins.cfg` endpoint, in-memory caching of raw Discord tokens, and JWT tokens exposed in WebSocket query strings.

| Severity | Count |
|----------|-------|
| Critical | 3     |
| High     | 4     |
| Medium   | 5     |
| Low      | 3     |

---

## CRITICAL

### C1: `/admins.cfg` publicly accessible when `CFG_ALLOWED_IPS` is empty

**File:** `packages/api/src/index.ts:59-72`

**Description:** The `/admins.cfg` endpoint generates a complete Squad admins configuration file containing all admin Steam IDs, roles, and permission levels. When the `CFG_ALLOWED_IPS` environment variable is unset or empty, the IP allowlist check is skipped entirely (the `if (allowedIps.length > 0)` guard means an empty list allows all traffic).

**Attack Scenario:** An attacker requests `GET /admins.cfg` on any deployment where `CFG_ALLOWED_IPS` hasn't been configured. They receive the full admin list including Steam IDs, role names, and permission mappings. This data can be used for targeted social engineering or to identify high-value targets.

**Remediation:**
```typescript
// Change from:
if (allowedIps.length > 0) {
  // ... check IP ...
}

// Change to:
if (allowedIps.length === 0) {
  return c.text("Forbidden: CFG_ALLOWED_IPS not configured", 403);
}
```

---

### C2: Auth sync cache stores raw Discord access tokens as Map keys

**File:** `packages/api/src/routes/auth.ts:20-35`

**Description:** The sync endpoint caches responses keyed by the raw Discord OAuth access token (`syncCache.set(accessToken, ...)`). This means:
1. All recently-used Discord access tokens exist in plaintext in process memory
2. Any memory dump, heap snapshot, or debug endpoint would expose every token used in the last minute
3. The cache returns the full JWT + permissions without re-verifying the Discord token, giving a stolen access token a guaranteed 1-minute replay window

**Attack Scenario:** If an attacker gains access to a process memory dump (via a separate vulnerability, debug endpoint, or shared hosting), they harvest every Discord access token used in the last minute. These tokens grant access to the user's Discord identity and can be used to authenticate as that user.

**Remediation:**
```typescript
import { createHash } from "crypto";

// Hash the token before using as cache key
const cacheKey = createHash("sha256").update(accessToken).digest("hex");
syncCache.set(cacheKey, { data: response, expiry: Date.now() + SYNC_CACHE_TTL_MS });
```

Alternatively, remove the cache entirely. The endpoint is already rate-limited to 10 req/min and the Discord API call is the intended source of truth.

---

### C3: WebSocket JWT tokens passed in URL query strings

**File:** `packages/api/src/index.ts:205-206, 230`

**Description:** Both WebSocket endpoints (`/live-server/ws` and `/presence/ws`) accept the JWT authentication token as a URL query parameter (`?token=<jwt>`). URL parameters are:
- Logged in web server access logs
- Stored in browser history
- Visible in referrer headers if the page navigates away
- Captured by proxy servers and CDNs
- Visible in process listings (`/proc` on Linux)

**Attack Scenario:** An organization's proxy server logs all URLs. The JWT tokens from WebSocket connections are captured in those logs. An insider or attacker who gains access to the proxy logs can extract valid JWT tokens (up to 4 hours before expiry) and use them to impersonate any user who connected to the live server dashboard.

**Remediation:** Accept the token in the first WebSocket message after upgrade rather than in the URL:
1. Allow the WebSocket upgrade without authentication
2. Require the first message to be `{ "type": "auth", "token": "<jwt>" }`
3. Verify the token and set permissions
4. Disconnect if the first message is not a valid auth message within a timeout (e.g., 5 seconds)

Alternative: Use the `Sec-WebSocket-Protocol` header to transport the token, which is not logged in standard access logs.

---

## HIGH

### H1: In-memory rate limiting -- not persistent, no cross-instance sharing

**File:** `packages/api/src/middleware/rate-limit.ts`

**Description:** Rate limit state is stored in a JavaScript `Map` in process memory. This has two consequences:
1. **Server restart resets all limits.** If an attacker can trigger a crash (via any unhandled exception or resource exhaustion), all rate limit counters reset to zero.
2. **Multi-instance deployment multiplies effective limits.** If the API runs behind a load balancer with N instances, each instance independently tracks rate limits, effectively giving attackers N times the allowed request rate.

**Attack Scenario:** An attacker sends requests distributed across multiple instances or times their attack around deployments/restarts to bypass rate limiting. This could be used to brute-force the auth endpoint or scrape data from public endpoints beyond intended limits.

**Remediation:**
- **Short-term:** Document this as a known limitation. Ensure the server doesn't expose crash vectors.
- **Long-term:** Use Redis-backed rate limiting with a shared counter. Packages like `rate-limiter-flexible` support Redis as a backing store.

---

### H2: No IDOR protection on user management endpoints

**File:** `packages/api/src/routes/users.ts:99-132, 157-168`

**Description:** The `PUT /users/:id` and `DELETE /users/:id` endpoints check that the caller has `manage:members` permission, but do not verify:
- Whether the target user has higher privileges than the caller
- Whether the caller is attempting to modify their own account to escalate privileges
- Whether the target is a master admin (`ADMIN_DISCORD_IDS`)

**Attack Scenario:** A user with `manage:members` permission (e.g., a moderator) could:
1. Delete admin user accounts via `DELETE /users/:id`
2. Modify another user's Steam ID to point to the attacker's Steam ID, potentially inheriting whitelist access
3. Perform a denial-of-service by bulk-deleting users

**Remediation:**
- Prevent users from modifying/deleting users who have the `admin` permission
- Prevent self-deletion
- Add audit logging with before/after state for user modifications (currently only whitelist and role changes are audited)

---

### H3: JWT tokens cannot be revoked

**Description:** JWTs are stateless with a 4-hour expiration and no `jti` (JWT ID) claim. There is no server-side mechanism to revoke a token once issued. If a user's roles change, they lose access, or a token is compromised, the token remains valid for up to 4 hours.

**Attack Scenario:** An admin removes a user's permissions via the dashboard. The user's existing JWT still contains the old permissions and remains valid for up to 4 hours, during which they retain full access to all previously-authorized endpoints.

**Remediation:**
1. Add a `jti` claim to JWTs (random UUID)
2. Maintain a deny-list of revoked `jti` values (Redis set with TTL matching token expiry)
3. Check the deny-list in `authMiddleware` before accepting tokens
4. Revoke tokens when permissions change

As a lighter alternative, reduce token expiration from 4 hours to 30-60 minutes and re-sync permissions on token refresh.

---

### H4: `$queryRawUnsafe` usage creates ongoing SQL injection risk

**Files:**
- `packages/api/src/routes/tickets.ts` (15 raw queries)
- `packages/api/src/routes/discord-bot.ts` (20+ raw queries)
- `packages/api/src/routes/stats.ts` (2 raw queries)

**Description:** The codebase uses Prisma's `$queryRawUnsafe()` extensively for querying the Secretary and SquadJS databases. While **all current usages correctly use parameterized queries** (`?` placeholders with separate parameter arguments), the function name `Unsafe` exists for a reason -- it accepts arbitrary SQL strings. Any future developer modifying these queries could accidentally introduce SQL injection by string-concatenating user input instead of using parameters.

In particular, the dynamic WHERE clause construction in `discord-bot.ts:373-383` and `tickets.ts:181-191` builds SQL strings by appending conditions. While the current pattern is safe (conditions use `?` placeholders), the pattern itself is error-prone.

**Remediation:**
- Add prominent comments on each `$queryRawUnsafe` call warning about SQL injection
- Create a query builder helper that enforces parameterization
- Where possible, migrate to Prisma's typed query API (this requires the Secretary DB schema to be defined in Prisma, which may not be feasible for external databases)
- Add ESLint rule to flag new `$queryRawUnsafe` usage for mandatory review

---

## MEDIUM

### M1: Error handling leaks Discord API error details

**File:** `packages/api/src/routes/auth.ts:131-141`

**Description:** The auth sync catch block uses `err instanceof Error ? err.message : "Auth sync failed"` and then checks `if (message.includes("guild member fetch failed: 404"))`. While the error message is logged (not returned to client) for most cases, the pattern of matching on error message strings is fragile. If Discord changes their error format, the guild-not-found check silently breaks, and users outside the guild would see a generic 500 instead of the intended 403.

**Remediation:** Match on HTTP status codes rather than error message strings. Create an explicit `DiscordApiError` class with a `status` property that can be checked reliably.

---

### M2: No request body size limit

**File:** `packages/api/src/index.ts` (no body limit middleware)

**Description:** No explicit body size limit is configured. The bulk whitelist endpoint (`POST /whitelist/bulk`) accepts up to 500 entries, and Zod string validation doesn't include `.max()` on most string fields. A malicious request could send 500 entries each with very long strings, consuming significant memory.

**Remediation:**
```typescript
import { bodyLimit } from "hono/body-limit";
app.use("*", bodyLimit({ maxSize: 1024 * 1024 })); // 1MB
```

Also add `.max()` constraints to Zod string fields on bulk-accepting endpoints.

---

### M3: CORS includes `localhost:3000` in production

**File:** `packages/api/src/index.ts:35-40`

**Description:** The CORS origin list unconditionally includes `http://localhost:3000`. In production, this means any process running on localhost:3000 on a user's machine could make authenticated cross-origin requests to the production API (if the user has valid cookies/tokens).

**Remediation:**
```typescript
const origins = [
  "https://royalbattalion.com",
  "https://www.royalbattalion.com",
  "https://stg.royalbattalion.xyz",
];
if (process.env.NODE_ENV !== "production") {
  origins.push("http://localhost:3000");
}
```

---

### M4: Docker entrypoint runs `prisma db push --accept-data-loss`

**Description:** The API Dockerfile entrypoint runs `prisma db push --accept-data-loss` on every container start. The `--accept-data-loss` flag tells Prisma to drop columns/tables if the schema has changed in a way that requires it. This means an accidental schema change in a deployment could silently destroy production data.

**Remediation:**
- Use `prisma migrate deploy` for production (applies recorded migrations)
- Reserve `prisma db push` for development environments only
- Remove `--accept-data-loss` from any production command

---

### M5: No Content-Security-Policy headers

**Description:** Hono's `secureHeaders()` middleware sets standard headers like `X-Frame-Options`, `X-Content-Type-Options`, and `Strict-Transport-Security`, but does not configure a Content-Security-Policy (CSP). Without CSP, any XSS vulnerability in the frontend has unrestricted access to execute scripts, make requests, and exfiltrate data.

**Remediation:** Add CSP headers via Next.js `next.config.js` security headers or Hono middleware:
```
Content-Security-Policy: default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' https://cdn.discordapp.com; connect-src 'self' https://api.royalbattalion.com wss://api.royalbattalion.com
```

Tune the policy based on actual resource requirements.

---

## LOW

### L1: Sync cache has no maximum size

**File:** `packages/api/src/routes/auth.ts:20`

**Description:** The `syncCache` Map grows without bound. While the 1-minute TTL and 10 req/min rate limit make memory exhaustion unlikely in practice, a determined attacker could rotate access tokens to fill the cache beyond what's cleaned up.

**Remediation:** Cap the cache at a fixed size (e.g., 500 entries) and evict oldest entries when full, or replace with an LRU cache library.

---

### L2: WebSocket messages not schema-validated

**File:** `packages/api/src/index.ts:300-310`

**Description:** WebSocket messages are parsed as JSON and then destructured with broad typing. There's no Zod validation -- invalid fields are silently ignored and unknown action types fall through to a default error. While this doesn't cause a direct vulnerability, it means:
- Extra memory allocated for unexpected properties
- Harder to detect and log malformed requests
- No clear contract for WebSocket message format

**Remediation:** Define a Zod schema for WebSocket messages and validate before processing.

---

### L3: Presence WebSocket broadcasts full user list

**File:** `packages/api/src/index.ts:135-149`

**Description:** Every user connected to the presence WebSocket receives the full list of all connected users (userId, userName, avatarUrl, currentPage). This discloses which admins are online and which dashboard pages they're viewing.

**Remediation:** Consider restricting presence data based on the viewer's permissions, or only broadcasting user counts rather than individual user details.

---

## Positive Findings

The following security measures are well-implemented:

1. **AES-256-GCM encryption** (`packages/api/src/lib/crypto.ts`) -- proper IV generation, auth tag verification, graceful migration path for unencrypted values
2. **Comprehensive audit logging** -- all state-changing admin operations are logged with user context and detailed diffs
3. **Granular RBAC** -- 19 permissions with role-based assignment and admin bypass
4. **Input validation** -- Zod schemas on all request bodies with enum validation for permissions
5. **Parameterized SQL** -- all `$queryRawUnsafe` calls correctly use `?` placeholders
6. **Secure headers** -- `secureHeaders()` middleware applied globally
7. **Password masking** -- SFTP passwords never returned in API responses (replaced with `********`)
8. **Error sanitization** -- global error handler returns generic "Internal server error" messages
9. **CORS restrictions** -- limited to specific known domains (with the caveat of M3)
10. **Discord OAuth** -- leverages a professional identity provider; no password storage
