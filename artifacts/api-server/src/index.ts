import app from "./app";
import { logger } from "./lib/logger";
import { configValid, configError } from "./bot/config.js";
import { initLinkStore } from "./bot/link-store.js";
import { createBot } from "./bot/index";

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error("PORT environment variable is required but was not provided.");
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

// Initialise persistent link store before the bot starts so getActiveUrl() is ready.
initLinkStore();

app.listen(port, (err) => {
  if (err) {
    logger.error({ err }, "Error listening on port");
    process.exit(1);
  }
  logger.info({ port }, "Server listening");
});

// ── Telegram bot ──────────────────────────────────────────────────────────────
if (!configValid) {
  logger.warn(configError ?? "Bot config invalid — bot will not start.");
  logger.warn(
    "To fix: open Replit Secrets and add TELEGRAM_BOT_TOKEN and ADMIN_CHAT_ID, then restart the server.",
  );
} else {
  async function startBot(attempt = 1): Promise<void> {
    const bot = createBot();
    try {
      logger.info({ attempt }, "Telegram bot polling started");
      await bot.start({
        drop_pending_updates: true,
        onStart: (info) => logger.info({ username: info.username }, "Bot started"),
      });
    } catch (err: any) {
      if (err?.error_code === 409) {
        const delay = Math.min(5000 * attempt, 60_000);
        logger.warn({ attempt, delay }, "Bot polling conflict — will retry");
        await new Promise((r) => setTimeout(r, delay));
        return startBot(attempt + 1);
      }
      logger.error({ err }, "Telegram bot error — polling stopped");
    }
  }

  startBot().catch((err) => {
    logger.error({ err }, "Telegram bot failed to start — check TELEGRAM_BOT_TOKEN");
  });
}
