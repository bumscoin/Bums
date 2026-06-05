// ── Token ─────────────────────────────────────────────────────────────────────
const token = process.env["TELEGRAM_BOT_TOKEN"] ?? "";

// ── Admin IDs ─────────────────────────────────────────────────────────────────
// Reads from multiple env vars so any combination works:
//   ADMIN_CHAT_ID        — primary admin (set as Replit Secret)
//   ADMIN_CHAT_ID_2      — second admin (env var, no secret conflict)
//   TELEGRAM_ADMIN_IDS   — comma-separated list of additional IDs (optional)
const collectedIds: number[] = [];

function addId(raw: string | undefined) {
  if (!raw) return;
  const n = parseInt(raw.trim(), 10);
  if (!isNaN(n) && !collectedIds.includes(n)) collectedIds.push(n);
}

function addList(raw: string | undefined) {
  if (!raw) return;
  for (const part of raw.split(",")) addId(part.trim());
}

addId(process.env["ADMIN_CHAT_ID"]);
addId(process.env["ADMIN_CHAT_ID_2"]);
addList(process.env["TELEGRAM_ADMIN_IDS"]);

const adminIds: number[] = collectedIds;

// ── Default announcement template ─────────────────────────────────────────────
// buttonUrl is intentionally omitted — all send paths resolve the active URL
// dynamically via getActiveUrl() from link-store, so the live URL is always used.
const DEFAULT_ANNOUNCEMENT = {
  title: "📢 Official Announcement",
  description:
    "The $BUMS Airdrop distribution is now live.\n\n" +
    "Eligible participants can now access the Mini App to view their allocation and submit their claim.\n\n" +
    "Please review your allocation details and follow the instructions provided in the application.",
  buttonText: "🎁 Claim Your $BUMS",
};

// ── Config validity ───────────────────────────────────────────────────────────
const missingVars: string[] = [];
if (!token) missingVars.push("TELEGRAM_BOT_TOKEN");
if (adminIds.length === 0) missingVars.push("ADMIN_CHAT_ID (or TELEGRAM_ADMIN_IDS)");

const configValid = missingVars.length === 0;
const configError = configValid
  ? null
  : `Missing required environment variables: ${missingVars.join(", ")}. ` +
    `Bot will not start. Please configure these in your Replit Secrets and restart.`;

export { token, adminIds, DEFAULT_ANNOUNCEMENT, configValid, configError };
