import express, { type Request, Response, NextFunction } from "express";
import { registerRoutes } from "./routes";
import { setupVite, serveStatic, log } from "./vite";
import { db } from "./db";
import { profiles, transactionLedger, adminLogs } from "../shared/schema";
import { desc, eq, sql } from "drizzle-orm";

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path.startsWith("/api")) {
      log(`${req.method} ${path} ${res.statusCode} in ${duration}ms`);
    }
  });

  next();
});

// ═══════════════════════════════════════════════════════════════════════
// LEADERBOARD SCHEDULER — runs every day at 9:00 PM IST (15:30 UTC)
// Finds the top user, creates a ₹100 prize record, logs it, and marks
// the daily reset in admin_logs.
// Dev: checks every 60 s via setInterval.
// Prod: swap setInterval for a cron trigger / Supabase Edge Function cron.
// ═══════════════════════════════════════════════════════════════════════

const LEADERBOARD_PRIZE_RUPEES = 100;
const LEADERBOARD_PRIZE_COINS  = LEADERBOARD_PRIZE_RUPEES * 10; // 1000 coins

let lastLeaderboardReset = "";  // tracks last date the job ran

async function runLeaderboardReset(): Promise<void> {
  const today = new Date().toISOString().split("T")[0];
  if (lastLeaderboardReset === today) return; // already ran today
  lastLeaderboardReset = today;

  log(`[Leaderboard] 🏆 9 PM reset triggered for ${today}`);

  try {
    // ── Find today's top user (highest total_coins) ──────────────────
    const [topUser] = await db
      .select({ id: profiles.id, displayName: profiles.displayName, totalCoins: profiles.totalCoins })
      .from(profiles)
      .orderBy(desc(profiles.totalCoins))
      .limit(1);

    if (!topUser) {
      log("[Leaderboard] No users found — skipping payout");
      return;
    }

    log(`[Leaderboard] 🥇 Winner: ${topUser.displayName} (${topUser.id}) — ${topUser.totalCoins} coins`);

    const idempotencyKey = `leaderboard-prize-${today}`;

    // ── Idempotency: skip if already rewarded today ──────────────────
    const [existing] = await db.select()
      .from(transactionLedger)
      .where(eq(transactionLedger.idempotencyKey, idempotencyKey));
    if (existing) {
      log("[Leaderboard] Prize already awarded today — skip");
      return;
    }

    // ── Award 1000 coins (= ₹100) to the winner ─────────────────────
    await db.transaction(async (tx) => {
      const [profile] = await tx
        .select({ totalCoins: profiles.totalCoins, lifetimeEarnings: profiles.lifetimeEarnings })
        .from(profiles).where(eq(profiles.id, topUser.id));

      if (!profile) throw new Error("Winner profile not found");

      const balanceBefore = Number(profile.totalCoins)      || 0;
      const balanceAfter  = Math.round((balanceBefore + LEADERBOARD_PRIZE_COINS) * 10) / 10;
      const newLifetime   = Math.round(((Number(profile.lifetimeEarnings) || 0) + LEADERBOARD_PRIZE_COINS) * 10) / 10;

      await tx.update(profiles).set({
        totalCoins:       String(balanceAfter),
        lifetimeEarnings: String(newLifetime),
      }).where(eq(profiles.id, topUser.id));

      await tx.insert(transactionLedger).values({
        userId:         topUser.id,
        actionType:     "leaderboard_prize",
        amount:         String(LEADERBOARD_PRIZE_COINS),
        balanceBefore:  String(balanceBefore),
        balanceAfter:   String(balanceAfter),
        idempotencyKey,
      });

      // ── Admin log: record the reset + winner ────────────────────────
      await db.execute(
        sql`INSERT INTO admin_logs (admin_id, action, target_id, notes)
            VALUES (
              ${topUser.id},
              'leaderboard_reset',
              ${today},
              ${'Winner: ' + (topUser.displayName || topUser.id) + ' — ₹' + LEADERBOARD_PRIZE_RUPEES + ' prize awarded — Daily leaderboard reset'}
            )`
      );
    });

    log(`[Leaderboard] ✅ ₹${LEADERBOARD_PRIZE_RUPEES} prize awarded to ${topUser.displayName} | Reset complete for ${today}`);
  } catch (err: any) {
    log(`[Leaderboard] ❌ Reset error: ${err.message}`);
    lastLeaderboardReset = ""; // allow retry on next tick
  }
}

function startLeaderboardScheduler(): void {
  // Check every 60 seconds whether it is 9:00 PM IST (21:00 IST = 15:30 UTC)
  setInterval(() => {
    const now = new Date();
    // IST = UTC + 5:30
    const istHour   = (now.getUTCHours() + 5) % 24 + Math.floor((now.getUTCMinutes() + 30) / 60);
    const istMinute = (now.getUTCMinutes() + 30) % 60;

    // Fire at 21:00–21:00 IST (window: minute 0–1)
    if (istHour === 21 && istMinute === 0) {
      runLeaderboardReset().catch(err => log(`[Leaderboard] Unhandled: ${err.message}`));
    }
  }, 60_000);

  log("[Leaderboard] ⏰ Scheduler started — fires daily at 9:00 PM IST");
}

(async () => {
  const server = registerRoutes(app);

  app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";
    res.status(status).json({ message });
    throw err;
  });

  if (app.get("env") === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  const PORT = 5000;
  server.listen(PORT, "0.0.0.0", () => {
    log(`serving on port ${PORT}`);
    startLeaderboardScheduler();
  });
})();
