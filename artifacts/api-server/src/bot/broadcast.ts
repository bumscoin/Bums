import { Bot, InlineKeyboard } from "grammy";
import { getAllUsers } from "./store.js";
import { getActiveUrl } from "./link-store.js";
import { logger } from "../lib/logger.js";

export interface AnnouncementOptions {
  title: string;
  description: string;
  buttonText: string;
  buttonUrl?: string;
  fileId?: string;
  imageUrl?: string;
}

function buildCaption(title: string, description: string): string {
  return `*${esc(title)}*\n\n${esc(description)}`;
}

function esc(text: string): string {
  return text.replace(/([_*[\]()~`>#+\-=|{}.!\\])/g, "\\$1");
}

function buildUserKeyboard(buttonText: string, buttonUrl?: string): InlineKeyboard {
  return new InlineKeyboard().url(buttonText, buttonUrl ?? getActiveUrl());
}

async function sendOne(
  bot: Bot,
  chatId: number,
  opts: AnnouncementOptions,
  keyboard: InlineKeyboard,
) {
  const caption = buildCaption(opts.title, opts.description);
  const imageSource = opts.fileId ?? opts.imageUrl;

  if (imageSource) {
    await bot.api.sendPhoto(chatId, imageSource, {
      caption,
      parse_mode: "MarkdownV2",
      reply_markup: keyboard,
    });
  } else {
    await bot.api.sendMessage(chatId, caption, {
      parse_mode: "MarkdownV2",
      reply_markup: keyboard,
    });
  }
}

export async function sendPreview(
  bot: Bot,
  adminId: number,
  opts: AnnouncementOptions,
) {
  const keyboard = buildUserKeyboard(opts.buttonText, opts.buttonUrl);
  await sendOne(bot, adminId, opts, keyboard);
}

export async function broadcast(
  bot: Bot,
  opts: AnnouncementOptions,
): Promise<{ sent: number; failed: number }> {
  const users = getAllUsers();
  let sent = 0;
  let failed = 0;

  logger.info({ total: users.length }, "Starting broadcast");

  const keyboard = buildUserKeyboard(opts.buttonText, opts.buttonUrl);

  for (const user of users) {
    try {
      await sendOne(bot, user.userId, opts, keyboard);
      sent++;
      await sleep(50);
    } catch (err) {
      logger.warn({ userId: user.userId, err }, "Failed to send to user");
      failed++;
    }
  }

  logger.info({ sent, failed }, "Broadcast complete");
  return { sent, failed };
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}
