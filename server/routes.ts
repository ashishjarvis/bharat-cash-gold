import type { Express, Request, Response } from "express";
import { createServer, type Server } from "http";
import { db } from "./db";
import { profiles, transactionLedger, adLimits, userStreaks } from "../shared/schema";
import { eq, sql } from "drizzle-orm";

const AD_DAILY_LIMIT = 50;
const AD_COOLDOWN_MS = 30_000;
const STREAK_AD_REQUIREMENT = 5;
const STREAK_BONUS_COINS = 500;

export function registerRoutes(app: Express): Server {

  // ── MODULE 2: Atomic coin increment via RPC-equivalent Postgres function ──
  app.post("/api/coins/increment", async (req: Request, res: Response) => {
    const { userId, amount, actionType, deviceId } = req.body as {
      userId: string;
      amount: number;
      actionType: string;
      deviceId?: string;
    };
    if (!userId || amount == null || !actionType) {
      return res.status(400).json({ error: "Missing required fields" });
    }
    try {
      const result = await db.transaction(async (tx) => {
        const [profile] = await tx
          .select({ totalCoins: profiles.totalCoins, lifetimeEarnings: profiles.lifetimeEarnings })
          .from(profiles)
          .where(eq(profiles.id, userId));

        if (!profile) throw new Error("Profile not found");

        const balanceBefore = Number(profile.totalCoins) || 0;
        const balanceAfter = Math.round((balanceBefore + amount) * 10) / 10;
        const newLifetime = Math.round(((Number(profile.lifetimeEarnings) || 0) + amount) * 10) / 10;

        await tx
          .update(profiles)
          .set({ totalCoins: String(balanceAfter), lifetimeEarnings: String(newLifetime) })
          .where(eq(profiles.id, userId));

        await tx.insert(transactionLedger).values({
          userId,
          actionType,
          amount: String(amount),
          balanceBefore: String(balanceBefore),
          balanceAfter: String(balanceAfter),
          deviceId: deviceId ?? null,
        });

        return { balanceBefore, balanceAfter };
      });
      return res.json({ success: true, ...result });
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  });

  // ── MODULE 1: Check ad eligibility (server-side 50/day + 30s cooldown) ──
  app.post("/api/ads/check", async (req: Request, res: Response) => {
    const { userId } = req.body as { userId: string };
    if (!userId) return res.status(400).json({ error: "userId required" });

    try {
      const today = new Date().toISOString().split("T")[0];
      const now = new Date();

      const [limit] = await db
        .select()
        .from(adLimits)
        .where(eq(adLimits.userId, userId));

      if (!limit) {
        // First-time user — allowed
        return res.json({ allowed: true });
      }

      // Reset daily count if it's a new day
      if (limit.lastResetDate !== today) {
        return res.json({ allowed: true });
      }

      // Check daily cap
      if ((limit.adsWatchedToday ?? 0) >= AD_DAILY_LIMIT) {
        return res.json({ allowed: false, reason: "daily_limit" });
      }

      // Check 30-second server-side cooldown
      if (limit.lastAdTimestamp) {
        const elapsed = now.getTime() - new Date(limit.lastAdTimestamp).getTime();
        if (elapsed < AD_COOLDOWN_MS) {
          return res.json({ allowed: false, reason: "cooldown", remainingMs: AD_COOLDOWN_MS - elapsed });
        }
      }

      return res.json({ allowed: true });
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  });

  // ── MODULE 1: Record a completed ad (update limits + streak) ──
  app.post("/api/ads/complete", async (req: Request, res: Response) => {
    const { userId } = req.body as { userId: string };
    if (!userId) return res.status(400).json({ error: "userId required" });

    try {
      const today = new Date().toISOString().split("T")[0];
      const now = new Date();

      await db.transaction(async (tx) => {
        // Upsert ad_limits
        const [existing] = await tx.select().from(adLimits).where(eq(adLimits.userId, userId));
        const sameDay = existing?.lastResetDate === today;
        const newCount = sameDay ? (existing.adsWatchedToday ?? 0) + 1 : 1;

        if (existing) {
          await tx.update(adLimits).set({
            adsWatchedToday: newCount,
            lastAdTimestamp: now,
            lastResetDate: today,
          }).where(eq(adLimits.userId, userId));
        } else {
          await tx.insert(adLimits).values({
            userId,
            adsWatchedToday: 1,
            lastAdTimestamp: now,
            lastResetDate: today,
          });
        }

        // MODULE 3: Update streak
        const [streak] = await tx.select().from(userStreaks).where(eq(userStreaks.userId, userId));
        const yesterday = new Date(now);
        yesterday.setDate(yesterday.getDate() - 1);
        const yesterdayStr = yesterday.toISOString().split("T")[0];

        if (streak) {
          const sameDay = streak.lastAdDate === today;
          const consecutive = streak.lastAdDate === yesterdayStr;
          const adsToday = sameDay ? (streak.adsToday ?? 0) + 1 : 1;
          const newStreak = sameDay ? streak.currentStreak : consecutive ? (streak.currentStreak ?? 0) + 1 : 1;

          // Bonus: 7-day streak with 5 ads/day
          let streakBonus = 0;
          if (newStreak >= 7 && adsToday >= STREAK_AD_REQUIREMENT) {
            streakBonus = STREAK_BONUS_COINS;
          }

          await tx.update(userStreaks).set({
            currentStreak: newStreak,
            lastAdDate: today,
            adsToday,
          }).where(eq(userStreaks.userId, userId));

          if (streakBonus > 0) {
            // Record streak bonus in ledger (handled by /api/coins/increment call on client)
            return { streakBonus };
          }
        } else {
          await tx.insert(userStreaks).values({
            userId,
            currentStreak: 1,
            lastAdDate: today,
            adsToday: 1,
          });
        }
      });

      return res.json({ success: true });
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  });

  // ── MODULE 4: Forced app version check ──
  app.get("/api/config", (_req: Request, res: Response) => {
    res.json({
      minimum_app_version: process.env.MIN_APP_VERSION ?? "1.0.0",
      maintenance: false,
    });
  });

  // ── MODULE 5: Referral — reward referrer after new user completes 10 taps ──
  app.post("/api/referral/reward", async (req: Request, res: Response) => {
    const { referrerId, referredId, tapCount } = req.body as {
      referrerId: string;
      referredId: string;
      tapCount: number;
    };
    if (!referrerId || !referredId || tapCount == null) {
      return res.status(400).json({ error: "Missing fields" });
    }
    if (tapCount < 10) {
      return res.json({ rewarded: false, reason: "Referred user has not completed 10 taps yet" });
    }
    try {
      // Give referrer 5 coins
      await db.transaction(async (tx) => {
        const [profile] = await tx
          .select({ totalCoins: profiles.totalCoins, lifetimeEarnings: profiles.lifetimeEarnings })
          .from(profiles).where(eq(profiles.id, referrerId));
        if (!profile) throw new Error("Referrer not found");
        const before = Number(profile.totalCoins) || 0;
        const after = Math.round((before + 5) * 10) / 10;
        await tx.update(profiles).set({ totalCoins: String(after) }).where(eq(profiles.id, referrerId));
        await tx.insert(transactionLedger).values({
          userId: referrerId,
          actionType: "referral_bonus",
          amount: "5",
          balanceBefore: String(before),
          balanceAfter: String(after),
        });
      });
      return res.json({ rewarded: true });
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  });

  const httpServer = createServer(app);
  return httpServer;
}
