// Usage: node packages/lobby-service/scripts/get-steam-token.mjs
// NOTE: Must run with Node.js, not Bun. steam-user relies on Node.js
// network internals that Bun doesn't fully support.

import SteamUser from "steam-user"
import * as readline from "readline"

const LOGIN_TIMEOUT_MS = 30_000

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
})

function ask(question) {
  return new Promise((resolve) => rl.question(question, resolve))
}

const client = new SteamUser()

async function main() {
  const username = await ask("Steam username: ")
  const password = await ask("Steam password: ")

  console.log("\nLogging in...")

  const timeout = setTimeout(() => {
    console.error(
      "\nLogin timed out after 30s. Possible causes:\n" +
        "  - Running with Bun instead of Node.js (use: node get-steam-token.mjs)\n" +
        "  - Steam servers unreachable\n" +
        "  - Incorrect credentials (no error event fired)\n"
    )
    client.logOff()
    rl.close()
    process.exit(1)
  }, LOGIN_TIMEOUT_MS)

  client.on("debug", (msg) => {
    console.log("[debug]", msg)
  })

  client.logOn({
    accountName: username,
    password: password,
  })

  client.on("steamGuard", async (_domain, callback) => {
    const code = await ask("Steam Guard code: ")
    callback(code)
  })

  client.on("refreshToken", (token) => {
    clearTimeout(timeout)
    console.log("\n--- STEAM_REFRESH_TOKEN ---")
    console.log(token)
    console.log("--- END ---\n")
    console.log("Copy this token into your STEAM_REFRESH_TOKEN environment variable.")
    client.logOff()
    rl.close()
  })

  client.on("loggedOn", () => {
    clearTimeout(timeout)
    console.log("Logged in successfully, waiting for refresh token...")
  })

  client.on("error", (err) => {
    clearTimeout(timeout)
    console.error("Login failed:", err.message)
    rl.close()
    process.exit(1)
  })
}

main()
