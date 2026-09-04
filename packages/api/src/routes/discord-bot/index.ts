import { Hono } from "hono";
import { authMiddleware } from "../../middleware/auth";
import overview from "./overview";
import messages from "./messages";
import seeding from "./seeding";
import birthday from "./birthday";
import timeouts from "./timeouts";
import tempvoice from "./tempvoice";

const discordBot = new Hono();

// Auth middleware applied globally to all discord-bot routes
discordBot.use("*", authMiddleware);

// Mount sub-routers
discordBot.route("/", overview);
discordBot.route("/", messages);
discordBot.route("/", seeding);
discordBot.route("/", birthday);
discordBot.route("/", timeouts);
discordBot.route("/", tempvoice);

export default discordBot;
