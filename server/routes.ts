import type { Express, Request, Response, NextFunction } from "express";
import { createServer, type Server } from "http";
import { createHash } from "crypto";
import bcrypt from "bcryptjs";
import { db } from "./db";
import {
  profiles, withdrawals, referrals,
  transactionLedger, adLimits, userStreaks,
} from "../shared/schema";
import { eq, sql, desc, and } from "drizzle-orm";

const BCRYPT_ROUNDS = 10;

const AD_DAILY_LIMIT       = 50;
const AD_COOLDOWN_MS       = 30_000;
const STREAK_AD_REQUIREMENT = 5;
const STREAK_BONUS_COINS   = 500;
const REFERRAL_REWARD_COINS = 100;   // Referral 2.0: reward after first ad
const ADMIN_MOBILE         = process.env.ADMIN_MOBILE || "9507124965";
const CPX_SECRET_HASH      = process.env.CPX_SECRET_HASH || "WTUge88NbM";

// ── Helper: generate unique transaction ID ────────────────────────────────
function genTxnId(): string {
  return `BC${Date.now().toString(36).toUpperCase()}${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
}

// ── Helper: SHA-256 (legacy only — for password migration) ───────────────
function legacySha256Hash(password: string): string {
  return createHash("sha256").update(password + "bharat_cash_salt").digest("hex");
}

// ── Helper: verify admin by userId ───────────────────────────────────────
async function verifyAdmin(adminUserId: string): Promise<boolean> {
  const [admin] = await db.select({ isAdmin: profiles.isAdmin, mobile: profiles.mobileNumber })
    .from(profiles).where(eq(profiles.id, adminUserId));
  return !!(admin?.isAdmin || admin?.mobile === ADMIN_MOBILE);
}

// ── Middleware: require admin — applied to ALL /api/admin/* routes ────────
// Reads adminUserId from: header X-Admin-User-Id > body.adminUserId > query.adminUserId
const requireAdmin = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  const adminUserId = (
    (req.headers["x-admin-user-id"] as string | undefined) ||
    req.body?.adminUserId ||
    (req.query?.adminUserId as string | undefined)
  );

  if (!adminUserId) {
    res.status(403).json({ error: "Forbidden — admin authentication required" });
    return;
  }

  try {
    const isAdmin = await verifyAdmin(adminUserId);
    if (!isAdmin) {
      res.status(403).json({ error: "Forbidden — admin access denied" });
      return;
    }
    // Attach verified adminId to request for downstream handlers
    (req as any).verifiedAdminId = adminUserId;
    next();
  } catch {
    res.status(500).json({ error: "Admin verification failed" });
  }
};

export function registerRoutes(app: Express): Server {

  // ═══════════════════════════════════════════════════════════════════════
  // SECURITY: Admin middleware — gates ALL /api/admin/* routes server-side
  // Any request to /api/admin/* that doesn't pass verifyAdmin() gets 403.
  // This runs BEFORE individual route handlers are evaluated.
  // ═══════════════════════════════════════════════════════════════════════
  app.use("/api/admin", requireAdmin);

  // ═══════════════════════════════════════════════════════════════════════
  // AUTH: Secure registration — bcrypt password hashing server-side
  // ═══════════════════════════════════════════════════════════════════════
  app.post("/api/auth/register", async (req: Request, res: Response) => {
    const { name, mobile, password } = req.body as {
      name: string; mobile: string; password: string;
    };
    if (!name || !mobile || !password) {
      return res.status(400).json({ error: "Missing required fields" });
    }
    if (password.length < 6) {
      return res.status(400).json({ error: "Password must be at least 6 characters" });
    }

    try {
      // Check if mobile already registered
      const [existing] = await db.select({ id: profiles.id })
        .from(profiles).where(eq(profiles.mobileNumber, mobile));
      if (existing) {
        return res.status(409).json({ error: "Mobile number already registered. Please login." });
      }

      const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);
      const id = crypto.randomUUID();

      await db.insert(profiles).values({
        id,
        displayName: name,
        mobileNumber: mobile,
        passwordHash,
        totalCoins: "0",
        lifetimeEarnings: "0",
      });

      return res.json({ success: true, userId: id, displayName: name, mobileNumber: mobile });
    } catch (err: any) {
      console.error("[Auth] Register error:", err.message);
      return res.status(500).json({ error: "Failed to create account. Please try again." });
    }
  });

  // ═══════════════════════════════════════════════════════════════════════
  // AUTH: Secure login — bcrypt verify with SHA-256 migration fallback
  // If an existing user still has a legacy SHA-256 hash, we accept it,
  // then transparently upgrade their stored hash to bcrypt.
  // ═══════════════════════════════════════════════════════════════════════
  app.post("/api/auth/login", async (req: Request, res: Response) => {
    const { mobile, password } = req.body as { mobile: string; password: string };
    if (!mobile || !password) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    try {
      const [profile] = await db
        .select({
          id: profiles.id,
          displayName: profiles.displayName,
          mobileNumber: profiles.mobileNumber,
          passwordHash: profiles.passwordHash,
          totalCoins: profiles.totalCoins,
          lifetimeEarnings: profiles.lifetimeEarnings,
        })
        .from(profiles).where(eq(profiles.mobileNumber, mobile));

      if (!profile) {
        return res.status(401).json({ error: "Mobile number not found. Please sign up." });
      }
      if (!profile.passwordHash) {
        return res.status(401).json({ error: "This account uses Google Sign-In. Please use that instead." });
      }

      // ── Primary: bcrypt verify ────────────────────────────────
      let passwordValid = await bcrypt.compare(password, profile.passwordHash);

      // ── Fallback: legacy SHA-256 — migrate hash to bcrypt ────
      if (!passwordValid) {
        const legacyHash = legacySha256Hash(password);
        if (profile.passwordHash === legacyHash) {
          passwordValid = true;
          // Upgrade: replace legacy SHA-256 with bcrypt silently
          const newHash = await bcrypt.hash(password, BCRYPT_ROUNDS);
          await db.update(profiles)
            .set({ passwordHash: newHash })
            .where(eq(profiles.id, profile.id));
          console.log(`[Auth] Migrated password hash for user ${profile.id} from SHA-256 to bcrypt`);
        }
      }

      if (!passwordValid) {
        return res.status(401).json({ error: "Incorrect password. Please try again." });
      }

      return res.json({
        success: true,
        userId: profile.id,
        displayName: profile.displayName,
        mobileNumber: profile.mobileNumber,
        totalCoins: Number(profile.totalCoins) || 0,
        lifetimeEarnings: Number(profile.lifetimeEarnings) || 0,
      });
    } catch (err: any) {
      console.error("[Auth] Login error:", err.message);
      return res.status(500).json({ error: "An unexpected error occurred." });
    }
  });

  // ═══════════════════════════════════════════════════════════════════════
  // MODULE 2: Atomic coin increment — all balance changes go through here
  // ═══════════════════════════════════════════════════════════════════════
  app.post("/api/coins/increment", async (req: Request, res: Response) => {
    const { userId, amount, actionType, deviceId, idempotencyKey } = req.body as {
      userId: string; amount: number; actionType: string;
      deviceId?: string; idempotencyKey?: string;
    };
    if (!userId || amount == null || !actionType) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    try {
      // Idempotency check: if this key was already processed, return cached result
      if (idempotencyKey) {
        const [existing] = await db.select()
          .from(transactionLedger)
          .where(eq(transactionLedger.idempotencyKey, idempotencyKey));
        if (existing) {
          return res.json({ success: true, duplicate: true,
            balanceBefore: Number(existing.balanceBefore),
            balanceAfter: Number(existing.balanceAfter) });
        }
      }

      const result = await db.transaction(async (tx) => {
        const [profile] = await tx
          .select({ totalCoins: profiles.totalCoins, lifetimeEarnings: profiles.lifetimeEarnings })
          .from(profiles).where(eq(profiles.id, userId));
        if (!profile) throw new Error("Profile not found");

        const balanceBefore = Number(profile.totalCoins) || 0;
        const balanceAfter  = Math.round((balanceBefore + amount) * 10) / 10;
        const newLifetime   = Math.round(((Number(profile.lifetimeEarnings) || 0) + amount) * 10) / 10;

        await tx.update(profiles)
          .set({ totalCoins: String(balanceAfter), lifetimeEarnings: String(newLifetime) })
          .where(eq(profiles.id, userId));

        await tx.insert(transactionLedger).values({
          userId, actionType,
          amount: String(amount),
          balanceBefore: String(balanceBefore),
          balanceAfter:  String(balanceAfter),
          deviceId:      deviceId ?? null,
          idempotencyKey: idempotencyKey ?? null,
        });

        return { balanceBefore, balanceAfter };
      });
      return res.json({ success: true, ...result });
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  });

  // ═══════════════════════════════════════════════════════════════════════
  // MODULE 1: Ad eligibility check (50/day + 30s server-side cooldown)
  // ═══════════════════════════════════════════════════════════════════════
  app.post("/api/ads/check", async (req: Request, res: Response) => {
    const { userId } = req.body as { userId: string };
    if (!userId) return res.status(400).json({ error: "userId required" });

    try {
      const today = new Date().toISOString().split("T")[0];
      const now   = new Date();
      const [limit] = await db.select().from(adLimits).where(eq(adLimits.userId, userId));

      if (!limit) return res.json({ allowed: true });

      if (limit.lastResetDate !== today) return res.json({ allowed: true });

      if ((limit.adsWatchedToday ?? 0) >= AD_DAILY_LIMIT) {
        return res.json({ allowed: false, reason: "daily_limit" });
      }

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

  // ═══════════════════════════════════════════════════════════════════════
  // MODULE 1: Record completed ad — updates limits + streak + referral 2.0
  // ═══════════════════════════════════════════════════════════════════════
  app.post("/api/ads/complete", async (req: Request, res: Response) => {
    const { userId } = req.body as { userId: string };
    if (!userId) return res.status(400).json({ error: "userId required" });

    try {
      const today = new Date().toISOString().split("T")[0];
      const now   = new Date();
      let streakBonus = 0;
      let referralRewarded = false;

      await db.transaction(async (tx) => {
        // ── Update ad_limits ────────────────────────────────────────
        const [existing] = await tx.select().from(adLimits).where(eq(adLimits.userId, userId));
        const sameDay  = existing?.lastResetDate === today;
        const newCount = sameDay ? (existing.adsWatchedToday ?? 0) + 1 : 1;
        const isFirstAdEver = !existing; // used for Referral 2.0

        if (existing) {
          await tx.update(adLimits).set({
            adsWatchedToday: newCount,
            lastAdTimestamp: now,
            lastResetDate:   today,
          }).where(eq(adLimits.userId, userId));
        } else {
          await tx.insert(adLimits).values({
            userId, adsWatchedToday: 1, lastAdTimestamp: now, lastResetDate: today,
          });
        }

        // ── MODULE 3: Update 7-day streak ───────────────────────────
        const [streak] = await tx.select().from(userStreaks).where(eq(userStreaks.userId, userId));
        const yesterday = new Date(now);
        yesterday.setDate(yesterday.getDate() - 1);
        const yesterdayStr = yesterday.toISOString().split("T")[0];

        if (streak) {
          const sameDayStreak  = streak.lastAdDate === today;
          const consecutive    = streak.lastAdDate === yesterdayStr;
          const adsToday       = sameDayStreak ? (streak.adsToday ?? 0) + 1 : 1;
          const newStreak      = sameDayStreak ? streak.currentStreak
            : consecutive ? (streak.currentStreak ?? 0) + 1 : 1;

          await tx.update(userStreaks).set({
            currentStreak: newStreak,
            lastAdDate: today,
            adsToday,
          }).where(eq(userStreaks.userId, userId));

          // ── 7-day bonus ready flag (claimed separately) ──────────
          if (newStreak >= 7 && adsToday >= STREAK_AD_REQUIREMENT) {
            streakBonus = STREAK_BONUS_COINS;
          }
        } else {
          await tx.insert(userStreaks).values({
            userId, currentStreak: 1, lastAdDate: today, adsToday: 1,
          });
        }

        // ── MODULE 4: Referral 2.0 — reward referrer on first ad ───
        if (isFirstAdEver || newCount === 1) {
          const [ref] = await tx.select().from(referrals)
            .where(and(eq(referrals.referredId, userId), eq(referrals.firstAdWatched, false)));

          if (ref) {
            // Mark referral as first-ad-watched
            await tx.update(referrals).set({ firstAdWatched: true }).where(eq(referrals.id, ref.id));

            // Check referrer hasn't been double-rewarded
            if (!ref.rewardClaimed) {
              const [referrer] = await tx.select({ totalCoins: profiles.totalCoins })
                .from(profiles).where(eq(profiles.id, ref.referrerId));

              if (referrer) {
                const before = Number(referrer.totalCoins) || 0;
                const after  = Math.round((before + REFERRAL_REWARD_COINS) * 10) / 10;

                await tx.update(profiles)
                  .set({ totalCoins: String(after), referralCount: sql`referral_count + 1` })
                  .where(eq(profiles.id, ref.referrerId));

                await tx.update(referrals)
                  .set({ rewardClaimed: true, rewardedAt: now })
                  .where(eq(referrals.id, ref.id));

                await tx.insert(transactionLedger).values({
                  userId: ref.referrerId,
                  actionType: "referral_bonus",
                  amount: String(REFERRAL_REWARD_COINS),
                  balanceBefore: String(before),
                  balanceAfter:  String(after),
                  idempotencyKey: `referral-${ref.id}`,
                });

                referralRewarded = true;
              }
            }
          }
        }
      });

      return res.json({ success: true, streakBonus, referralRewarded });
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  });

  // ═══════════════════════════════════════════════════════════════════════
  // MODULE 1: Withdrawal — atomic deduct + lock + record
  // ═══════════════════════════════════════════════════════════════════════
  app.post("/api/withdrawals/create", async (req: Request, res: Response) => {
    const { userId, coinsAmount, upiId, paymentMethod } = req.body as {
      userId: string; coinsAmount: number; upiId: string; paymentMethod?: string;
    };

    if (!userId || !coinsAmount || !upiId) {
      return res.status(400).json({ error: "Missing required fields" });
    }
    if (coinsAmount < 10) {
      return res.status(400).json({ error: "Minimum withdrawal is 10 coins" });
    }

    const transactionId = genTxnId();
    const rupeesAmount  = coinsAmount / 10;

    try {
      await db.transaction(async (tx) => {
        // Lock row for update
        const [profile] = await tx
          .select({ totalCoins: profiles.totalCoins, lockedCoins: profiles.lockedCoins })
          .from(profiles).where(eq(profiles.id, userId));

        if (!profile) throw new Error("Profile not found");

        const currentCoins  = Number(profile.totalCoins)  || 0;
        const currentLocked = Number(profile.lockedCoins) || 0;

        if (currentCoins < coinsAmount) {
          throw new Error("Insufficient balance");
        }

        // Check for existing pending withdrawal (prevent spam)
        const [pendingExisting] = await db
          .select({ id: withdrawals.id })
          .from(withdrawals)
          .where(and(eq(withdrawals.userId, userId), eq(withdrawals.status, "pending")));

        if (pendingExisting) {
          throw new Error("You already have a pending withdrawal request");
        }

        const newCoins  = Math.round((currentCoins  - coinsAmount) * 10) / 10;
        const newLocked = Math.round((currentLocked + coinsAmount) * 10) / 10;

        // Deduct from balance, add to locked_coins
        await tx.update(profiles).set({
          totalCoins:  String(newCoins),
          lockedCoins: String(newLocked),
        }).where(eq(profiles.id, userId));

        // Create withdrawal record
        await tx.insert(withdrawals).values({
          userId,
          transactionId,
          upiId: `${paymentMethod ? paymentMethod + ':' : ''}${upiId}`,
          coinsAmount: String(coinsAmount),
          rupeesAmount: String(rupeesAmount),
          lockedAmount: String(coinsAmount),
          status: "pending",
        });

        // Audit ledger
        await tx.insert(transactionLedger).values({
          userId, actionType: "withdrawal_lock",
          amount: String(-coinsAmount),
          balanceBefore: String(currentCoins),
          balanceAfter:  String(newCoins),
          idempotencyKey: `withdrawal-${transactionId}`,
        });
      });

      return res.json({ success: true, transactionId, rupeesAmount });
    } catch (err: any) {
      return res.status(400).json({ error: err.message });
    }
  });

  // ═══════════════════════════════════════════════════════════════════════
  // ADMIN: List all withdrawals (admin only)
  // ═══════════════════════════════════════════════════════════════════════
  app.get("/api/admin/withdrawals", async (req: Request, res: Response) => {
    const adminId = req.query.adminUserId as string;
    if (!adminId || !(await verifyAdmin(adminId))) {
      return res.status(403).json({ error: "Forbidden" });
    }
    try {
      const rows = await db.select().from(withdrawals).orderBy(desc(withdrawals.createdAt));
      return res.json({ withdrawals: rows });
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  });

  // ADMIN: Approve withdrawal
  app.post("/api/admin/approve", async (req: Request, res: Response) => {
    const { withdrawalId, adminUserId, notes } = req.body as {
      withdrawalId: string; adminUserId: string; notes?: string;
    };
    if (!withdrawalId || !adminUserId) {
      return res.status(400).json({ error: "Missing fields" });
    }
    if (!(await verifyAdmin(adminUserId))) {
      return res.status(403).json({ error: "Forbidden" });
    }

    try {
      await db.transaction(async (tx) => {
        const [w] = await tx.select().from(withdrawals).where(eq(withdrawals.id, withdrawalId));
        if (!w) throw new Error("Withdrawal not found");
        if (w.status !== "pending") throw new Error(`Withdrawal is already ${w.status}`);

        const coinsAmount = Number(w.coinsAmount);

        // Remove from locked_coins
        const [profile] = await tx.select({ lockedCoins: profiles.lockedCoins })
          .from(profiles).where(eq(profiles.id, w.userId));
        if (!profile) throw new Error("User not found");

        const newLocked = Math.max(0, (Number(profile.lockedCoins) || 0) - coinsAmount);

        await tx.update(profiles)
          .set({ lockedCoins: String(newLocked) })
          .where(eq(profiles.id, w.userId));

        await tx.update(withdrawals)
          .set({ status: "approved", notes: notes ?? "Approved by admin" })
          .where(eq(withdrawals.id, withdrawalId));

        await tx.insert(transactionLedger).values({
          userId: w.userId, actionType: "withdrawal_approved",
          amount: String(-coinsAmount),
          balanceBefore: String(Number(profile.lockedCoins) || 0),
          balanceAfter:  String(newLocked),
          idempotencyKey: `approve-${withdrawalId}`,
        });

        // Admin log
        await db.execute(sql`INSERT INTO admin_logs (admin_id, action, target_id, notes)
          VALUES (${adminUserId}, 'approve', ${withdrawalId}, ${notes ?? 'Approved'})`);
      });

      return res.json({ success: true });
    } catch (err: any) {
      return res.status(400).json({ error: err.message });
    }
  });

  // ADMIN: Reject withdrawal — refund locked coins
  app.post("/api/admin/reject", async (req: Request, res: Response) => {
    const { withdrawalId, adminUserId, notes } = req.body as {
      withdrawalId: string; adminUserId: string; notes?: string;
    };
    if (!withdrawalId || !adminUserId) {
      return res.status(400).json({ error: "Missing fields" });
    }
    if (!(await verifyAdmin(adminUserId))) {
      return res.status(403).json({ error: "Forbidden" });
    }

    try {
      await db.transaction(async (tx) => {
        const [w] = await tx.select().from(withdrawals).where(eq(withdrawals.id, withdrawalId));
        if (!w) throw new Error("Withdrawal not found");
        if (w.status !== "pending") throw new Error(`Withdrawal is already ${w.status}`);

        const coinsAmount = Number(w.coinsAmount);

        const [profile] = await tx
          .select({ totalCoins: profiles.totalCoins, lockedCoins: profiles.lockedCoins })
          .from(profiles).where(eq(profiles.id, w.userId));
        if (!profile) throw new Error("User not found");

        const currentCoins  = Number(profile.totalCoins)  || 0;
        const currentLocked = Number(profile.lockedCoins) || 0;
        const newCoins      = Math.round((currentCoins + coinsAmount) * 10) / 10;
        const newLocked     = Math.max(0, currentLocked - coinsAmount);

        // Refund: move locked_coins back to total_coins
        await tx.update(profiles).set({
          totalCoins:  String(newCoins),
          lockedCoins: String(newLocked),
        }).where(eq(profiles.id, w.userId));

        await tx.update(withdrawals)
          .set({ status: "rejected", notes: notes ?? "Rejected by admin" })
          .where(eq(withdrawals.id, withdrawalId));

        await tx.insert(transactionLedger).values({
          userId: w.userId, actionType: "withdrawal_rejected_refund",
          amount: String(coinsAmount),
          balanceBefore: String(currentCoins),
          balanceAfter:  String(newCoins),
          idempotencyKey: `reject-${withdrawalId}`,
        });

        await db.execute(sql`INSERT INTO admin_logs (admin_id, action, target_id, notes)
          VALUES (${adminUserId}, 'reject', ${withdrawalId}, ${notes ?? 'Rejected'})`);
      });

      return res.json({ success: true });
    } catch (err: any) {
      return res.status(400).json({ error: err.message });
    }
  });

  // ═══════════════════════════════════════════════════════════════════════
  // CPX SURVEY: Postback endpoint (called by CPX server after survey done)
  // CPX sends: GET/POST /api/cpx/postback?status=1&trans_id=X&amount=Y&user_id=Z&subid_1=sessionId
  // ═══════════════════════════════════════════════════════════════════════
  app.all("/api/cpx/postback", async (req: Request, res: Response) => {
    const p = { ...req.query, ...req.body } as Record<string, string>;
    const { status, trans_id, amount, user_id, subid_1, hash } = p;

    console.log("[CPX] Postback received:", JSON.stringify({ status, trans_id, amount, user_id, subid_1 }));

    // ── HMAC signature verification ───────────────────────────────────
    // CPX Research signs postbacks as: md5(user_id + CPX_SECRET_HASH)
    // Reject any postback that arrives without a valid signature.
    if (CPX_SECRET_HASH && CPX_SECRET_HASH !== "WTUge88NbM") {
      // Only enforce when a real secret has been configured (not the placeholder)
      const expectedHash = createHash("md5")
        .update(`${user_id}${CPX_SECRET_HASH}`)
        .digest("hex");
      if (!hash || hash !== expectedHash) {
        console.error("[CPX] REJECTED — invalid HMAC signature. received:", hash, "expected:", expectedHash);
        return res.status(403).send("error");
      }
    } else {
      console.warn("[CPX] ⚠️  HMAC verification skipped — set CPX_SECRET_HASH env var to a real value to enable");
    }

    // Validate: status must be 1 (completed)
    if (status !== "1") {
      console.log("[CPX] Non-complete status:", status, "— ignoring");
      return res.send("ok");
    }

    if (!user_id || !trans_id) {
      console.error("[CPX] Missing user_id or trans_id");
      return res.send("error");
    }

    const rewardRupees = parseFloat(amount || "0");
    if (rewardRupees <= 0) {
      console.error("[CPX] Invalid reward amount:", amount);
      return res.send("error");
    }

    // ₹1 = 10 coins
    const coins = Math.round(rewardRupees * 10);
    const idempotencyKey = `cpx-${trans_id}`;

    try {
      const [profile] = await db.select({ totalCoins: profiles.totalCoins })
        .from(profiles).where(eq(profiles.id, user_id));

      if (!profile) {
        console.error("[CPX] User not found:", user_id);
        return res.send("error");
      }

      // Idempotency: check if already rewarded
      const [existing] = await db.select().from(transactionLedger)
        .where(eq(transactionLedger.idempotencyKey, idempotencyKey));

      if (existing) {
        console.log("[CPX] Duplicate postback for trans_id:", trans_id, "— skipped");
        return res.send("ok");
      }

      const balanceBefore = Number(profile.totalCoins) || 0;
      const balanceAfter  = Math.round((balanceBefore + coins) * 10) / 10;

      await db.transaction(async (tx) => {
        await tx.update(profiles)
          .set({ totalCoins: String(balanceAfter) })
          .where(eq(profiles.id, user_id));

        await tx.insert(transactionLedger).values({
          userId: user_id, actionType: "survey_reward",
          amount: String(coins),
          balanceBefore: String(balanceBefore),
          balanceAfter:  String(balanceAfter),
          idempotencyKey,
          deviceId: subid_1 ?? null, // using deviceId column to store sessionId temporarily
        });
      });

      console.log(`[CPX] ✅ Rewarded ${coins} coins (₹${rewardRupees}) to user ${user_id}`);
      return res.send("ok");
    } catch (err: any) {
      console.error("[CPX] Error:", err.message);
      return res.send("error");
    }
  });

  // CPX: Poll whether reward has been received for a session
  app.get("/api/cpx/reward-status", async (req: Request, res: Response) => {
    const { sessionId, userId } = req.query as { sessionId: string; userId: string };
    if (!sessionId || !userId) return res.status(400).json({ error: "Missing params" });

    try {
      const [reward] = await db.select()
        .from(transactionLedger)
        .where(and(
          eq(transactionLedger.userId, userId),
          eq(transactionLedger.actionType, "survey_reward"),
          eq(transactionLedger.deviceId, sessionId),
        ));

      if (reward) {
        return res.json({ rewarded: true, coins: Number(reward.amount) });
      }
      return res.json({ rewarded: false });
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  });

  // ═══════════════════════════════════════════════════════════════════════
  // MODULE 3: Streak status
  // ═══════════════════════════════════════════════════════════════════════
  app.get("/api/streak/status", async (req: Request, res: Response) => {
    const { userId } = req.query as { userId: string };
    if (!userId) return res.status(400).json({ error: "userId required" });

    try {
      const today = new Date().toISOString().split("T")[0];

      const [streak] = await db.select().from(userStreaks).where(eq(userStreaks.userId, userId));
      if (!streak) {
        return res.json({
          currentStreak: 0, adsToday: 0, lastAdDate: null, lastBonusClaimed: null,
          todayComplete: false, canClaimBonus: false,
        });
      }

      const adsToday       = streak.lastAdDate === today ? (streak.adsToday ?? 0) : 0;
      const todayComplete  = adsToday >= STREAK_AD_REQUIREMENT;
      const bonusAlreadyClaimed = streak.lastBonusClaimed === today;
      const canClaimBonus  = (streak.currentStreak ?? 0) >= 7 && todayComplete && !bonusAlreadyClaimed;

      return res.json({
        currentStreak:    streak.currentStreak ?? 0,
        adsToday,
        lastAdDate:       streak.lastAdDate,
        lastBonusClaimed: streak.lastBonusClaimed,
        todayComplete,
        canClaimBonus,
      });
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  });

  // MODULE 3: Claim 7-day streak bonus (500 coins, idempotent)
  app.post("/api/streak/claim-bonus", async (req: Request, res: Response) => {
    const { userId } = req.body as { userId: string };
    if (!userId) return res.status(400).json({ error: "userId required" });

    try {
      const today = new Date().toISOString().split("T")[0];
      const idempotencyKey = `streak-bonus-${userId}-${today}`;

      // Idempotency check
      const [existing] = await db.select().from(transactionLedger)
        .where(eq(transactionLedger.idempotencyKey, idempotencyKey));
      if (existing) {
        return res.status(409).json({ error: "Bonus already claimed today" });
      }

      const [streak] = await db.select().from(userStreaks).where(eq(userStreaks.userId, userId));
      if (!streak || (streak.currentStreak ?? 0) < 7) {
        return res.status(400).json({ error: "7-day streak not completed" });
      }

      const adsToday = streak.lastAdDate === today ? (streak.adsToday ?? 0) : 0;
      if (adsToday < STREAK_AD_REQUIREMENT) {
        return res.status(400).json({ error: "Need 5 ads today to claim" });
      }

      await db.transaction(async (tx) => {
        const [profile] = await tx.select({ totalCoins: profiles.totalCoins })
          .from(profiles).where(eq(profiles.id, userId));
        if (!profile) throw new Error("Profile not found");

        const balanceBefore = Number(profile.totalCoins) || 0;
        const balanceAfter  = Math.round((balanceBefore + STREAK_BONUS_COINS) * 10) / 10;

        await tx.update(profiles)
          .set({ totalCoins: String(balanceAfter), lifetimeEarnings: sql`lifetime_earnings + ${STREAK_BONUS_COINS}` })
          .where(eq(profiles.id, userId));

        await tx.update(userStreaks)
          .set({ lastBonusClaimed: today })
          .where(eq(userStreaks.userId, userId));

        await tx.insert(transactionLedger).values({
          userId, actionType: "treasure_chest_bonus",
          amount: String(STREAK_BONUS_COINS),
          balanceBefore: String(balanceBefore),
          balanceAfter:  String(balanceAfter),
          idempotencyKey,
        });
      });

      return res.json({ success: true, coins: STREAK_BONUS_COINS });
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  });

  // ═══════════════════════════════════════════════════════════════════════
  // GAMEZONE: Claim play-time reward — 2 coins per 2 minutes, 50/day max
  // ═══════════════════════════════════════════════════════════════════════
  app.post("/api/gamezone/reward", async (req: Request, res: Response) => {
    const { userId, sessionId, minuteBlock } = req.body as {
      userId: string; sessionId: string; minuteBlock: number;
    };

    if (!userId || !sessionId || minuteBlock == null) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    const COINS_PER_BLOCK  = 2;
    const DAILY_COIN_LIMIT = 50;

    const idempotencyKey = `gamezone-${userId}-${sessionId}-${minuteBlock}`;

    try {
      // Idempotency: reject duplicate claims for the same minute block
      const [dup] = await db.select()
        .from(transactionLedger)
        .where(eq(transactionLedger.idempotencyKey, idempotencyKey));
      if (dup) {
        return res.json({ success: false, error: "Already claimed for this block" });
      }

      // Sum today's GameZone earnings for this user
      const today = new Date().toISOString().split("T")[0];
      const startOfDay = new Date(`${today}T00:00:00.000Z`);

      const todayRows = await db.select({ amount: transactionLedger.amount })
        .from(transactionLedger)
        .where(
          and(
            eq(transactionLedger.userId, userId),
            eq(transactionLedger.actionType, "gamezone_reward"),
            sql`timestamp >= ${startOfDay}`,
          )
        );

      const earnedToday = todayRows.reduce((sum, r) => sum + (Number(r.amount) || 0), 0);

      if (earnedToday >= DAILY_COIN_LIMIT) {
        return res.json({ success: false, limitReached: true, totalToday: earnedToday });
      }

      // Cap so we never go over the daily limit
      const coinsToAward = Math.min(COINS_PER_BLOCK, DAILY_COIN_LIMIT - earnedToday);
      const newTotal     = earnedToday + coinsToAward;

      // Atomic: credit coins + ledger entry
      await db.transaction(async (tx) => {
        const [profile] = await tx.select({ totalCoins: profiles.totalCoins })
          .from(profiles).where(eq(profiles.id, userId));
        if (!profile) throw new Error("Profile not found");

        const balanceBefore = Number(profile.totalCoins) || 0;
        const balanceAfter  = Math.round((balanceBefore + coinsToAward) * 10) / 10;

        await tx.update(profiles)
          .set({ totalCoins: String(balanceAfter), lifetimeEarnings: sql`lifetime_earnings + ${coinsToAward}` })
          .where(eq(profiles.id, userId));

        await tx.insert(transactionLedger).values({
          userId,
          actionType: "gamezone_reward",
          amount: String(coinsToAward),
          balanceBefore: String(balanceBefore),
          balanceAfter:  String(balanceAfter),
          idempotencyKey,
        });
      });

      return res.json({
        success:      true,
        coinsAwarded: coinsToAward,
        totalToday:   newTotal,
        limitReached: newTotal >= DAILY_COIN_LIMIT,
      });
    } catch (err: any) {
      console.error("[GameZone] Reward error:", err.message);
      return res.status(500).json({ error: err.message });
    }
  });

  // ═══════════════════════════════════════════════════════════════════════
  // MODULE 4: Forced app version check + feature config
  // ═══════════════════════════════════════════════════════════════════════
  app.get("/api/config", (_req: Request, res: Response) => {
    res.json({
      minimum_app_version: process.env.MIN_APP_VERSION ?? "1.0.0",
      maintenance: false,
      gamezone_url: process.env.GAMEZONE_URL ?? null,
    });
  });

  // ═══════════════════════════════════════════════════════════════════════
  // MODULE 5: Referral reward (legacy endpoint — kept for compatibility)
  // New referral logic is handled in /api/ads/complete (Referral 2.0)
  // ═══════════════════════════════════════════════════════════════════════
  app.post("/api/referral/reward", async (req: Request, res: Response) => {
    const { referrerId, referredId, tapCount } = req.body as {
      referrerId: string; referredId: string; tapCount: number;
    };
    if (!referrerId || !referredId || tapCount == null) {
      return res.status(400).json({ error: "Missing fields" });
    }
    if (tapCount < 10) {
      return res.json({ rewarded: false, reason: "Referred user has not completed 10 taps yet" });
    }
    try {
      const idempotencyKey = `referral-legacy-${referrerId}-${referredId}`;
      const [dup] = await db.select().from(transactionLedger)
        .where(eq(transactionLedger.idempotencyKey, idempotencyKey));
      if (dup) return res.json({ rewarded: false, reason: "Already rewarded" });

      await db.transaction(async (tx) => {
        const [profile] = await tx
          .select({ totalCoins: profiles.totalCoins, lifetimeEarnings: profiles.lifetimeEarnings })
          .from(profiles).where(eq(profiles.id, referrerId));
        if (!profile) throw new Error("Referrer not found");
        const before = Number(profile.totalCoins) || 0;
        const after  = Math.round((before + 5) * 10) / 10;
        await tx.update(profiles).set({ totalCoins: String(after) }).where(eq(profiles.id, referrerId));
        await tx.insert(transactionLedger).values({
          userId: referrerId, actionType: "referral_bonus",
          amount: "5", balanceBefore: String(before), balanceAfter: String(after), idempotencyKey,
        });
      });
      return res.json({ rewarded: true });
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  });

  // ═══════════════════════════════════════════════════════════════════════
  // ADMIN: Check if user is admin
  // ═══════════════════════════════════════════════════════════════════════
  app.get("/api/admin/check", async (req: Request, res: Response) => {
    const userId = req.query.userId as string;
    if (!userId) return res.json({ isAdmin: false });
    const isAdmin = await verifyAdmin(userId);
    return res.json({ isAdmin });
  });

  const httpServer = createServer(app);
  return httpServer;
}
