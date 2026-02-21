import { Hono } from "hono";
import { cors } from "hono/cors";
import auth from "./routes/auth";
import users from "./routes/users";
import roles from "./routes/roles";
import whitelist from "./routes/whitelist";
import tickets from "./routes/tickets";
import matches from "./routes/matches";
import servers from "./routes/servers";
import stats from "./routes/stats";
import { syncMatches } from "./lib/match-sync";

const app = new Hono();

app.use(
  "*",
  cors({
    origin: [
      "http://localhost:3000",
      "https://royalbattalion.com",
      "https://www.royalbattalion.com",
      "https://stg.royalbattalion.xyz",
    ],
    credentials: true,
  })
);

app.route("/auth", auth);
app.route("/users", users);
app.route("/roles", roles);
app.route("/whitelist", whitelist);
app.route("/tickets", tickets);
app.route("/matches", matches);
app.route("/servers", servers);
app.route("/stats", stats);

app.get("/health", (c) => c.json({ status: "ok" }));

// Sync SquadJS matches on startup and every 15 minutes
if (process.env.SQUADJS_DATABASE_URL) {
  syncMatches().catch(console.error);
  setInterval(() => syncMatches().catch(console.error), 15 * 60 * 1000);
}

export default {
  port: Number(process.env.PORT) || 3001,
  fetch: app.fetch,
};
