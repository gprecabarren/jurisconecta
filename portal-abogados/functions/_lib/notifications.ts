import type { D1Database } from "./user-auth";

export type NoticeCategory = "case" | "support" | "account";

export async function notifyUser(db: D1Database, userId: string, category: NoticeCategory, title: string, body: string, href: string) {
  const preferences = await db.prepare("SELECT case_updates, support_updates, account_updates FROM notification_preferences WHERE user_id = ? LIMIT 1").bind(userId).first<{ case_updates: number; support_updates: number; account_updates: number }>();
  if (preferences && !preferences[`${category}_updates`]) return;
  await db.prepare("INSERT INTO notifications (id, user_id, category, title, body, href) VALUES (?, ?, ?, ?, ?, ?)").bind(crypto.randomUUID(), userId, category, title.slice(0, 120), body.slice(0, 300), href).run();
}
