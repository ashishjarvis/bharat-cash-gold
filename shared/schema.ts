import { pgTable, text, numeric, timestamp, uuid, boolean, integer, date } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const profiles = pgTable("profiles", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  email: text("email"),
  displayName: text("display_name"),
  avatarUrl: text("avatar_url"),
  totalCoins: numeric("total_coins").default("0"),
  lockedCoins: numeric("locked_coins").default("0"),     // coins locked during pending withdrawal
  lifetimeEarnings: numeric("lifetime_earnings").default("0"),
  mobileNumber: text("mobile_number").unique(),
  passwordHash: text("password_hash"),
  referralCode: text("referral_code").unique(),
  referredBy: uuid("referred_by"),
  referralCount: integer("referral_count").default(0),
  lastCheckinDate: date("last_checkin_date"),
  videosWatchedToday: integer("videos_watched_today").default(0),
  lastVideoResetDate: date("last_video_reset_date"),
  spinsToday: integer("spins_today").default(0),
  freeSpinUsed: boolean("free_spin_used").default(false),
  lastSpinResetDate: date("last_spin_reset_date"),
  isAdmin: boolean("is_admin").default(false),           // admin flag
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const withdrawals = pgTable("withdrawals", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: uuid("user_id").references(() => profiles.id).notNull(),
  transactionId: text("transaction_id"),                // unique idempotency key
  upiId: text("upi_id").notNull(),
  coinsAmount: numeric("coins_amount").notNull(),
  rupeesAmount: numeric("rupees_amount").notNull(),
  lockedAmount: numeric("locked_amount").default("0"),  // amount moved to locked_coins
  status: text("status").default("pending"),            // pending | approved | rejected
  notes: text("notes"),                                 // admin notes on approval/rejection
  createdAt: timestamp("created_at").defaultNow(),
});

export const referrals = pgTable("referrals", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  referrerId: uuid("referrer_id").notNull(),
  referredId: uuid("referred_id").notNull().unique(),
  referralCode: text("referral_code").notNull(),
  rewardClaimed: boolean("reward_claimed").default(false),
  firstAdWatched: boolean("first_ad_watched").default(false), // Referral 2.0: reward after first ad
  createdAt: timestamp("created_at").defaultNow(),
  rewardedAt: timestamp("rewarded_at"),
});

// Financial ledger — immutable audit trail of every coin movement
export const transactionLedger = pgTable("transaction_ledger", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: uuid("user_id").references(() => profiles.id).notNull(),
  actionType: text("action_type").notNull(),
  // 'ad_reward' | 'tap_reward' | 'streak_bonus' | 'referral_bonus' | 'spin_reward'
  // 'withdrawal_lock' | 'withdrawal_approved' | 'withdrawal_rejected_refund'
  // 'survey_reward' | 'treasure_chest_bonus' | 'leaderboard_prize'
  amount: numeric("amount", { precision: 10, scale: 2 }).notNull(),
  balanceBefore: numeric("balance_before", { precision: 10, scale: 2 }),
  balanceAfter: numeric("balance_after", { precision: 10, scale: 2 }),
  deviceId: text("device_id"),
  idempotencyKey: text("idempotency_key"),              // prevent duplicate rewards
  timestamp: timestamp("timestamp").defaultNow(),
});

// 7-Day Streak tracking
export const userStreaks = pgTable("user_streaks", {
  userId: uuid("user_id").primaryKey().references(() => profiles.id),
  currentStreak: integer("current_streak").default(0),
  lastAdDate: date("last_ad_date"),
  adsToday: integer("ads_today").default(0),
  lastBonusClaimed: date("last_bonus_claimed"),         // prevent double-claiming 7-day bonus
});

// Server-side daily ad limits (50 ads/day, 30s cooldown)
export const adLimits = pgTable("ad_limits", {
  userId: uuid("user_id").primaryKey().references(() => profiles.id),
  adsWatchedToday: integer("ads_watched_today").default(0),
  lastAdTimestamp: timestamp("last_ad_timestamp"),
  lastResetDate: date("last_reset_date"),
});

// Admin activity log
export const adminLogs = pgTable("admin_logs", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  adminId: uuid("admin_id").notNull(),
  action: text("action").notNull(),                     // 'approve' | 'reject'
  targetId: text("target_id"),                          // withdrawal_id or user_id
  notes: text("notes"),
  timestamp: timestamp("timestamp").defaultNow(),
});

export const insertProfileSchema = createInsertSchema(profiles);
export const insertWithdrawalSchema = createInsertSchema(withdrawals);
export const insertReferralSchema = createInsertSchema(referrals);

export type Profile    = typeof profiles.$inferSelect;
export type NewProfile = typeof profiles.$inferInsert;
export type Withdrawal    = typeof withdrawals.$inferSelect;
export type NewWithdrawal = typeof withdrawals.$inferInsert;
export type Referral    = typeof referrals.$inferSelect;
export type NewReferral = typeof referrals.$inferInsert;
