import { Hono } from "hono";
import { authMiddleware } from "../../middleware/auth";
import overview from "./overview";
import messages from "./messages";
import seeding from "./seeding";
import timeouts from "./timeouts";
import prospects from "./prospects";

const discordBot = new Hono();

// Auth middleware applied globally to all discord-bot routes
discordBot.use("*", authMiddleware);

// Mount sub-routers
discordBot.route("/", overview);
discordBot.route("/", messages);
discordBot.route("/", seeding);
discordBot.route("/", timeouts);
discordBot.route("/", prospects);

export default discordBot;
