import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import path from "node:path";
import { logger } from "../lib/logger.js";

// Resolve data dir relative to cwd (always the api-server package root when started via pnpm).
const DATA_DIR = path.resolve(process.cwd(), "data");
const CONFIG_FILE = path.join(DATA_DIR, "bot-config.json");

// In-memory active URL — seeded from env var, then overridden by saved file on init.
// MINI_APP_URL env var is the deployment-specific default; /set_link persists it to disk.
let activeUrl: string = process.env["MINI_APP_URL"] ?? "";

export function initLinkStore(): void {
  try {
    if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });

    if (existsSync(CONFIG_FILE)) {
      const raw = readFileSync(CONFIG_FILE, "utf-8");
      const data = JSON.parse(raw) as { miniAppUrl?: string };
      if (data.miniAppUrl) {
        activeUrl = data.miniAppUrl;
        logger.info({ url: activeUrl }, "Loaded Mini App URL from persistent store");
        return;
      }
    }

    if (activeUrl) {
      logger.info({ url: activeUrl }, "No saved Mini App URL — using MINI_APP_URL env var");
    } else {
      logger.warn(
        "No Mini App URL configured. Set MINI_APP_URL env var or use /set_link in Telegram to configure it.",
      );
    }
  } catch (err) {
    logger.warn({ err }, "Could not read bot-config.json — using env var or empty fallback");
  }
}

/** Returns the currently active Mini App URL. Empty string if not yet configured. */
export function getActiveUrl(): string {
  return activeUrl;
}

/** Persists a new URL to disk and updates the in-memory value immediately. */
export function setActiveUrl(url: string): void {
  activeUrl = url;
  try {
    if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });
    writeFileSync(CONFIG_FILE, JSON.stringify({ miniAppUrl: url }, null, 2), "utf-8");
    logger.info({ url }, "Mini App URL updated and persisted");
  } catch (err) {
    logger.error({ err }, "Failed to persist Mini App URL — change is in-memory only until restart");
  }
}
