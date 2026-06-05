import {
  Bot,
  InlineKeyboard,
  session,
  type Context,
  type SessionFlavor,
  type InlineQueryResultCachedPhoto,
  type InlineQueryResultPhoto,
  type InlineQueryResultArticle,
} from "grammy";
import { token, adminIds, DEFAULT_ANNOUNCEMENT, configValid, configError } from "./config.js";
import { getActiveUrl, setActiveUrl } from "./link-store.js";
import { registerUser, getUserCount, setPendingShare, getPendingShare } from "./store.js";
import { sendPreview, broadcast, type AnnouncementOptions } from "./broadcast.js";
import { logger } from "../lib/logger.js";

type AwaitingField =
  | "imageUrl"
  | "photo"
  | "title"
  | "description"
  | "buttonText"
  | "buttonUrl"
  | "postTarget"
  | "linkUrl"
  | null;

interface SessionData {
  pendingAnnouncement?: AnnouncementOptions;
  awaiting?: AwaitingField;
}

type BotContext = Context & SessionFlavor<SessionData>;

function isAdmin(ctx: BotContext): boolean {
  const userId = ctx.from?.id;
  if (!userId) return false;
  if (adminIds.length === 0) return true;
  return adminIds.includes(userId);
}

function escMd(text: string): string {
  return text.replace(/([_*[\]()~`>#+\-=|{}.!\\])/g, "\\$1");
}

function buildCaption(title: string, description: string): string {
  return `*${escMd(title)}*\n\n${escMd(description)}`;
}

function ensureAnn(session: SessionData): AnnouncementOptions {
  if (!session.pendingAnnouncement) {
    session.pendingAnnouncement = { ...DEFAULT_ANNOUNCEMENT };
  }
  return session.pendingAnnouncement;
}

async function postToChannel(
  bot: Bot<BotContext>,
  target: string | number,
  ann: AnnouncementOptions,
): Promise<void> {
  const caption = buildCaption(ann.title, ann.description);
  const url = ann.buttonUrl ?? getActiveUrl();
  const reply_markup = {
    inline_keyboard: [[{ text: ann.buttonText, url }]],
  };
  const imageSource = ann.fileId ?? ann.imageUrl;
  if (imageSource) {
    await bot.api.sendPhoto(target, imageSource, {
      caption,
      parse_mode: "MarkdownV2",
      reply_markup,
    });
  } else {
    await bot.api.sendMessage(target, caption, {
      parse_mode: "MarkdownV2",
      reply_markup,
    });
  }
}

function buildAdminPanel(ann: AnnouncementOptions) {
  const imageStatus = ann.fileId
    ? "✅ Photo uploaded"
    : ann.imageUrl
    ? "✅ Image URL set"
    : "❌ No image";

  const buttonUrl = ann.buttonUrl ?? getActiveUrl();
  const urlDisplay = buttonUrl.length > 40 ? buttonUrl.slice(0, 40) + "…" : buttonUrl;
  const activeUrl = getActiveUrl();
  const activeDisplay = activeUrl.length > 40 ? activeUrl.slice(0, 40) + "…" : activeUrl;

  return {
    text:
      `📢 *Announcement Builder*\n\n` +
      `*Title:* ${escMd(ann.title)}\n\n` +
      `*Description:*\n${escMd(ann.description)}\n\n` +
      `*Button:* ${escMd(ann.buttonText)}\n` +
      `*Button URL:* ${escMd(urlDisplay)}\n` +
      `*Image:* ${imageStatus}\n\n` +
      `🔗 *Active Mini App URL:*\n${escMd(activeDisplay)}`,
    keyboard: new InlineKeyboard()
      .text("👁 Preview", "ann_preview")
      .text("📤 Broadcast", "ann_broadcast_confirm")
      .row()
      .text("🖼 Upload Photo", "ann_upload_photo")
      .text("🔗 Set Image URL", "ann_set_image_url")
      .row()
      .text("📢 Share Announcement", "ann_share")
      .row()
      .text("🗑 Remove Image", "ann_remove_image"),
  };
}

export function createBot() {
  if (!configValid) {
    throw new Error(configError ?? "Bot config is invalid.");
  }

  const bot = new Bot<BotContext>(token);

  bot.use(session({ initial: (): SessionData => ({}) }));

  // ── /start ──────────────────────────────────────────────────────────────────
  bot.command("start", async (ctx) => {
    const userId = ctx.from?.id;
    if (userId) registerUser(userId, ctx.from?.first_name, ctx.from?.username);

    await ctx.reply(
      "👋 Welcome to the BUMS Airdrop!\n\nTap the button below to open the Mini App, view your allocation, and claim your $BUMS.",
      {
        reply_markup: {
          inline_keyboard: [
            [{ text: "🎁 Claim Your $BUMS", web_app: { url: getActiveUrl() } }],
          ],
        },
      },
    );
  });

  // ── /admin ────────────────────────────────────────────────────────────────────
  bot.command("admin", async (ctx) => {
    if (!isAdmin(ctx)) return ctx.reply("⛔ Access denied.");
    const activeUrl = getActiveUrl();
    const urlDisplay = activeUrl.length > 40 ? activeUrl.slice(0, 40) + "…" : activeUrl;
    await ctx.reply(
      `🛠 *Admin Panel*\n\n` +
        `👥 Registered users: *${getUserCount()}*\n\n` +
        `🔗 Active Mini App URL:\n\`${escMd(urlDisplay)}\`\n\n` +
        `Commands:\n` +
        `/announce — Build and broadcast announcement\n` +
        `/setannounce — Edit title, description, button\n` +
        `/set\\_link — Change Mini App URL\n` +
        `/post @channel — Post to a channel or group\n` +
        `/stats — View stats`,
      { parse_mode: "MarkdownV2" },
    );
  });

  // ── /stats ────────────────────────────────────────────────────────────────────
  bot.command("stats", async (ctx) => {
    if (!isAdmin(ctx)) return ctx.reply("⛔ Access denied.");
    await ctx.reply(
      `📊 *Bot Stats*\n\n👥 Total registered users: *${getUserCount()}*`,
      { parse_mode: "Markdown" },
    );
  });

  // ── /set_link ─────────────────────────────────────────────────────────────────
  bot.command("set_link", async (ctx) => {
    if (!isAdmin(ctx)) return ctx.reply("⛔ Access denied.");
    ctx.session.awaiting = "linkUrl";
    const current = getActiveUrl();
    await ctx.reply(
      `🔗 *Update Mini App URL*\n\n` +
        `Current URL:\n\`${escMd(current)}\`\n\n` +
        `Send the new Mini App URL \\(must start with https://\\):`,
      { parse_mode: "MarkdownV2" },
    );
  });

  // ── /post ─────────────────────────────────────────────────────────────────────
  bot.command("post", async (ctx) => {
    if (!isAdmin(ctx)) return ctx.reply("⛔ Access denied.");
    const ann = ensureAnn(ctx.session);
    const arg = ctx.match?.trim();

    if (!arg) {
      ctx.session.awaiting = "postTarget";
      await ctx.reply(
        `📡 *Post Announcement*\n\nSend the channel username or chat ID where the bot is an admin:\n\n` +
          `Examples:\n` +
          `• @mychannel\n` +
          `• \\-1001234567890`,
        { parse_mode: "MarkdownV2" },
      );
      return;
    }

    await ctx.reply("📡 Posting…");
    try {
      const target = arg.startsWith("@") ? arg : Number(arg);
      await postToChannel(bot, target, ann);
      await ctx.reply(`✅ Posted successfully to *${escMd(arg)}*\\.`, { parse_mode: "MarkdownV2" });
    } catch (err) {
      logger.error({ err, target: arg }, "Post to channel failed");
      await ctx.reply(
        `❌ Failed to post to *${escMd(arg)}*\\.\n\nMake sure:\n• The bot is added as an admin to that chat\n• The username or ID is correct`,
        { parse_mode: "MarkdownV2" },
      );
    }
  });

  // ── /announce ─────────────────────────────────────────────────────────────────
  bot.command("announce", async (ctx) => {
    if (!isAdmin(ctx)) return ctx.reply("⛔ Access denied.");
    ensureAnn(ctx.session);
    ctx.session.awaiting = null;

    const { text, keyboard } = buildAdminPanel(ctx.session.pendingAnnouncement!);
    await ctx.reply(text, { parse_mode: "MarkdownV2", reply_markup: keyboard });
  });

  // ── /setannounce ──────────────────────────────────────────────────────────────
  bot.command("setannounce", async (ctx) => {
    if (!isAdmin(ctx)) return ctx.reply("⛔ Access denied.");
    const ann = ensureAnn(ctx.session);
    ctx.session.awaiting = null;

    const currentUrl = ann.buttonUrl ?? getActiveUrl();
    await ctx.reply(
      `✏️ *Edit Announcement*\n\n` +
        `*Title:*\n${escMd(ann.title)}\n\n` +
        `*Description:*\n${escMd(ann.description)}\n\n` +
        `*Button text:*\n${escMd(ann.buttonText)}\n\n` +
        `*Button URL:*\n${escMd(currentUrl)}\n\n` +
        `Choose which field to edit:`,
      {
        parse_mode: "MarkdownV2",
        reply_markup: new InlineKeyboard()
          .text("✏️ Edit Title", "set_title")
          .row()
          .text("📝 Edit Description", "set_description")
          .row()
          .text("🔘 Edit Button Text", "set_button_text")
          .row()
          .text("🌐 Edit Button URL", "set_button_url")
          .row()
          .text("↩️ Back to Builder", "set_back"),
      },
    );
  });

  // ── setannounce — field pickers ───────────────────────────────────────────────
  bot.callbackQuery("set_title", async (ctx) => {
    if (!isAdmin(ctx)) return ctx.answerCallbackQuery("⛔ Access denied.");
    await ctx.answerCallbackQuery();
    ctx.session.awaiting = "title";
    await ctx.reply(
      `✏️ *Edit Title*\n\nCurrent: _${escMd(ensureAnn(ctx.session).title)}_\n\nSend the new title text:`,
      { parse_mode: "MarkdownV2" },
    );
  });

  bot.callbackQuery("set_description", async (ctx) => {
    if (!isAdmin(ctx)) return ctx.answerCallbackQuery("⛔ Access denied.");
    await ctx.answerCallbackQuery();
    ctx.session.awaiting = "description";
    await ctx.reply(
      `📝 *Edit Description*\n\nSend the new description text \\(supports multiple lines\\):`,
      { parse_mode: "MarkdownV2" },
    );
  });

  bot.callbackQuery("set_button_text", async (ctx) => {
    if (!isAdmin(ctx)) return ctx.answerCallbackQuery("⛔ Access denied.");
    await ctx.answerCallbackQuery();
    ctx.session.awaiting = "buttonText";
    await ctx.reply(
      `🔘 *Edit Button Text*\n\nCurrent: _${escMd(ensureAnn(ctx.session).buttonText)}_\n\nSend the new button label:`,
      { parse_mode: "MarkdownV2" },
    );
  });

  bot.callbackQuery("set_button_url", async (ctx) => {
    if (!isAdmin(ctx)) return ctx.answerCallbackQuery("⛔ Access denied.");
    await ctx.answerCallbackQuery();
    ctx.session.awaiting = "buttonUrl";
    const current = ensureAnn(ctx.session).buttonUrl ?? getActiveUrl();
    await ctx.reply(
      `🌐 *Edit Button URL*\n\nCurrent:\n${escMd(current)}\n\nSend the new URL \\(must start with https://\\)\\. Leave blank to use the active Mini App URL\\.`,
      { parse_mode: "MarkdownV2" },
    );
  });

  bot.callbackQuery("set_back", async (ctx) => {
    if (!isAdmin(ctx)) return ctx.answerCallbackQuery("⛔ Access denied.");
    await ctx.answerCallbackQuery();
    ctx.session.awaiting = null;
    const ann = ensureAnn(ctx.session);
    const { text, keyboard } = buildAdminPanel(ann);
    await ctx.reply(text, { parse_mode: "MarkdownV2", reply_markup: keyboard });
  });

  // ── Preview ───────────────────────────────────────────────────────────────────
  bot.callbackQuery("ann_preview", async (ctx) => {
    if (!isAdmin(ctx)) return ctx.answerCallbackQuery("⛔ Access denied.");
    const ann = ctx.session.pendingAnnouncement;
    if (!ann) return ctx.answerCallbackQuery("No announcement. Use /announce first.");

    await ctx.answerCallbackQuery("Sending preview…");
    try {
      await sendPreview(bot, ctx.from.id, ann);
    } catch (err) {
      logger.error({ err }, "Preview failed");
      await ctx.reply("❌ Preview failed\\. Check image URL if set\\.", { parse_mode: "MarkdownV2" });
    }
  });

  // ── Broadcast confirm ─────────────────────────────────────────────────────────
  bot.callbackQuery("ann_broadcast_confirm", async (ctx) => {
    if (!isAdmin(ctx)) return ctx.answerCallbackQuery("⛔ Access denied.");
    await ctx.answerCallbackQuery();
    const count = getUserCount();
    await ctx.reply(
      `⚠️ This will send the announcement to *${count}* user${count !== 1 ? "s" : ""}\\. Confirm?`,
      {
        parse_mode: "MarkdownV2",
        reply_markup: new InlineKeyboard()
          .text("✅ Send Now", "ann_broadcast_go")
          .text("❌ Cancel", "ann_cancel"),
      },
    );
  });

  // ── Broadcast go ──────────────────────────────────────────────────────────────
  bot.callbackQuery("ann_broadcast_go", async (ctx) => {
    if (!isAdmin(ctx)) return ctx.answerCallbackQuery("⛔ Access denied.");
    const ann = ctx.session.pendingAnnouncement;
    if (!ann) return ctx.answerCallbackQuery("No announcement. Use /announce first.");

    await ctx.answerCallbackQuery("Broadcasting…");
    await ctx.reply("📡 Broadcasting announcement…");
    const { sent, failed } = await broadcast(bot, ann);
    await ctx.reply(
      `✅ Broadcast complete\\!\n\n📨 Sent: *${sent}*\n❌ Failed: *${failed}*`,
      { parse_mode: "MarkdownV2" },
    );
    ctx.session.pendingAnnouncement = undefined;
  });

  // ── Upload Photo ──────────────────────────────────────────────────────────────
  bot.callbackQuery("ann_upload_photo", async (ctx) => {
    if (!isAdmin(ctx)) return ctx.answerCallbackQuery("⛔ Access denied.");
    await ctx.answerCallbackQuery();
    ctx.session.awaiting = "photo";
    await ctx.reply("📸 Send the announcement image as a photo now:");
  });

  // ── Set Image URL ─────────────────────────────────────────────────────────────
  bot.callbackQuery("ann_set_image_url", async (ctx) => {
    if (!isAdmin(ctx)) return ctx.answerCallbackQuery("⛔ Access denied.");
    await ctx.answerCallbackQuery();
    ctx.session.awaiting = "imageUrl";
    await ctx.reply(
      "🔗 Send the direct image URL \\(must end in \\.jpg / \\.png\\):",
      { parse_mode: "MarkdownV2" },
    );
  });

  // ── Remove Image ──────────────────────────────────────────────────────────────
  bot.callbackQuery("ann_remove_image", async (ctx) => {
    if (!isAdmin(ctx)) return ctx.answerCallbackQuery("⛔ Access denied.");
    await ctx.answerCallbackQuery("Image removed.");
    const ann = ensureAnn(ctx.session);
    ann.fileId = undefined;
    ann.imageUrl = undefined;
    const { text, keyboard } = buildAdminPanel(ann);
    await ctx.reply(text, { parse_mode: "MarkdownV2", reply_markup: keyboard });
  });

  // ── Share Announcement ────────────────────────────────────────────────────────
  bot.callbackQuery("ann_share", async (ctx) => {
    if (!isAdmin(ctx)) return ctx.answerCallbackQuery("⛔ Access denied.");
    await ctx.answerCallbackQuery();

    const ann = ensureAnn(ctx.session);
    setPendingShare(ctx.from.id, { ...ann });

    await ctx.reply(
      `📤 *How to share*\n\n` +
        `1\\. Tap *Choose a chat* below\n` +
        `2\\. Pick any user, group, or channel\n` +
        `3\\. The announcement card will appear — tap it to send\n\n` +
        `The shared post will include the image, caption, and Claim button\\.`,
      {
        parse_mode: "MarkdownV2",
        reply_markup: {
          inline_keyboard: [
            [
              {
                text: "📤 Choose a chat",
                switch_inline_query_chosen_chat: {
                  query: "",
                  allow_user_chats: true,
                  allow_bot_chats: false,
                  allow_group_chats: true,
                  allow_channel_chats: true,
                },
              },
            ],
          ],
        },
      },
    );
  });

  // ── Cancel ────────────────────────────────────────────────────────────────────
  bot.callbackQuery("ann_cancel", async (ctx) => {
    await ctx.answerCallbackQuery("Cancelled.");
    ctx.session.pendingAnnouncement = undefined;
    await ctx.reply("❌ Broadcast cancelled.");
  });

  // ── Inline query handler ──────────────────────────────────────────────────────
  bot.on("inline_query", async (ctx) => {
    const adminId = ctx.from.id;

    if (adminIds.length > 0 && !adminIds.includes(adminId)) {
      await ctx.answerInlineQuery([], { cache_time: 0 });
      return;
    }

    const ann = getPendingShare(adminId) ?? { ...DEFAULT_ANNOUNCEMENT };
    const activeUrl = getActiveUrl();
    const caption = buildCaption(ann.title, ann.description);
    const reply_markup = {
      inline_keyboard: [[{ text: ann.buttonText, url: ann.buttonUrl ?? activeUrl }]],
    };

    let result:
      | InlineQueryResultCachedPhoto
      | InlineQueryResultPhoto
      | InlineQueryResultArticle;

    if (ann.fileId) {
      result = {
        type: "photo",
        id: "bums_announce",
        photo_file_id: ann.fileId,
        caption,
        parse_mode: "MarkdownV2",
        reply_markup,
      } satisfies InlineQueryResultCachedPhoto;
    } else if (ann.imageUrl) {
      result = {
        type: "photo",
        id: "bums_announce",
        photo_url: ann.imageUrl,
        thumbnail_url: ann.imageUrl,
        caption,
        parse_mode: "MarkdownV2",
        reply_markup,
      } satisfies InlineQueryResultPhoto;
    } else {
      result = {
        type: "article",
        id: "bums_announce",
        title: ann.title,
        description: ann.description.slice(0, 100),
        input_message_content: {
          message_text: caption,
          parse_mode: "MarkdownV2",
        },
        reply_markup,
      } satisfies InlineQueryResultArticle;
    }

    await ctx.answerInlineQuery([result], { cache_time: 0, is_personal: true });
  });

  // ── Handle photo upload ───────────────────────────────────────────────────────
  bot.on("message:photo", async (ctx) => {
    const userId = ctx.from?.id;
    if (userId) registerUser(userId, ctx.from?.first_name, ctx.from?.username);

    if (!isAdmin(ctx) || ctx.session.awaiting !== "photo") return;

    const photos = ctx.message.photo;
    const fileId = photos[photos.length - 1].file_id;

    const ann = ensureAnn(ctx.session);
    ann.fileId = fileId;
    ann.imageUrl = undefined;
    ctx.session.awaiting = null;

    await ctx.reply(
      "✅ Photo saved\\! Use *👁 Preview* to verify before broadcasting\\.",
      { parse_mode: "MarkdownV2" },
    );
    const { text, keyboard } = buildAdminPanel(ann);
    await ctx.reply(text, { parse_mode: "MarkdownV2", reply_markup: keyboard });
  });

  // ── Handle text input ─────────────────────────────────────────────────────────
  bot.on("message:text", async (ctx) => {
    const userId = ctx.from?.id;
    if (userId) registerUser(userId, ctx.from?.first_name, ctx.from?.username);

    if (!isAdmin(ctx) || !ctx.session.awaiting) return;

    const value = ctx.message.text.trim();
    const ann = ensureAnn(ctx.session);
    const field = ctx.session.awaiting;
    ctx.session.awaiting = null;

    switch (field) {
      // ── /set_link handler ────────────────────────────────────────────────────
      case "linkUrl": {
        if (!value.startsWith("https://")) {
          await ctx.reply(
            "❌ Invalid URL\\. The URL must start with *https://*\\. Try again with /set\\_link\\.",
            { parse_mode: "MarkdownV2" },
          );
          return;
        }
        setActiveUrl(value);
        await ctx.reply(
          `✅ *Mini App URL updated\\!*\n\nAll buttons now point to:\n\`${escMd(value)}\`\n\nThis change is saved and will survive a restart\\.`,
          { parse_mode: "MarkdownV2" },
        );
        return;
      }

      case "imageUrl":
        ann.imageUrl = value;
        ann.fileId = undefined;
        await ctx.reply(
          "✅ Image URL saved\\! Use *👁 Preview* to verify before broadcasting\\.",
          { parse_mode: "MarkdownV2" },
        );
        break;

      case "title":
        ann.title = value;
        await ctx.reply(
          `✅ Title updated to:\n\n*${escMd(value)}*\n\nWhat else would you like to edit?`,
          {
            parse_mode: "MarkdownV2",
            reply_markup: new InlineKeyboard()
              .text("✏️ Edit Title", "set_title")
              .row()
              .text("📝 Edit Description", "set_description")
              .row()
              .text("🔘 Edit Button Text", "set_button_text")
              .row()
              .text("↩️ Back to Builder", "set_back"),
          },
        );
        return;

      case "description":
        ann.description = value;
        await ctx.reply(
          `✅ Description updated\\.\n\nWhat else would you like to edit?`,
          {
            parse_mode: "MarkdownV2",
            reply_markup: new InlineKeyboard()
              .text("✏️ Edit Title", "set_title")
              .row()
              .text("📝 Edit Description", "set_description")
              .row()
              .text("🔘 Edit Button Text", "set_button_text")
              .row()
              .text("↩️ Back to Builder", "set_back"),
          },
        );
        return;

      case "buttonText":
        ann.buttonText = value;
        await ctx.reply(
          `✅ Button text updated to: *${escMd(value)}*\n\nWhat else would you like to edit?`,
          {
            parse_mode: "MarkdownV2",
            reply_markup: new InlineKeyboard()
              .text("✏️ Edit Title", "set_title")
              .row()
              .text("📝 Edit Description", "set_description")
              .row()
              .text("🔘 Edit Button Text", "set_button_text")
              .row()
              .text("↩️ Back to Builder", "set_back"),
          },
        );
        return;

      case "buttonUrl": {
        ann.buttonUrl = value.length > 0 ? value : undefined;
        const displayUrl = ann.buttonUrl ?? getActiveUrl();
        await ctx.reply(
          `✅ Button URL updated to:\n\n${escMd(displayUrl)}\n\nWhat else would you like to edit?`,
          {
            parse_mode: "MarkdownV2",
            reply_markup: new InlineKeyboard()
              .text("✏️ Edit Title", "set_title")
              .row()
              .text("📝 Edit Description", "set_description")
              .row()
              .text("🔘 Edit Button Text", "set_button_text")
              .row()
              .text("🌐 Edit Button URL", "set_button_url")
              .row()
              .text("↩️ Back to Builder", "set_back"),
          },
        );
        return;
      }

      case "postTarget": {
        await ctx.reply("📡 Posting…");
        try {
          const target = value.startsWith("@") ? value : Number(value);
          await postToChannel(bot, target, ann);
          await ctx.reply(
            `✅ Posted successfully to *${escMd(value)}*\\.`,
            { parse_mode: "MarkdownV2" },
          );
        } catch (err) {
          logger.error({ err, target: value }, "Post to channel failed");
          await ctx.reply(
            `❌ Failed to post to *${escMd(value)}*\\.\n\nMake sure:\n• The bot is added as an admin to that chat\n• The username or ID is correct`,
            { parse_mode: "MarkdownV2" },
          );
        }
        return;
      }
    }

    const { text, keyboard } = buildAdminPanel(ann);
    await ctx.reply(text, { parse_mode: "MarkdownV2", reply_markup: keyboard });
  });

  bot.catch((err) => {
    logger.error({ err: err.error, update: err.ctx.update }, "Bot error");
  });

  return bot;
}
