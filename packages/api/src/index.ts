import { Hono } from "hono";
import { cors } from "hono/cors";
import auth from "./routes/auth";
import users from "./routes/users";
import roles from "./routes/roles";
import whitelist from "./routes/whitelist";
import tickets from "./routes/tickets";

const app = new Hono();

app.use(
  "*",
  cors({
    origin: [
      "http://localhost:3000",
      "https://royalbattalion.com",
      "https://www.royalbattalion.com",
      "https://stg.royalbattalion.com",
    ],
    credentials: true,
  })
);

app.route("/auth", auth);
app.route("/users", users);
app.route("/roles", roles);
app.route("/whitelist", whitelist);
app.route("/tickets", tickets);

app.get("/health", (c) => c.json({ status: "ok" }));

export default {
  port: Number(process.env.PORT) || 3001,
  fetch: app.fetch,
};
