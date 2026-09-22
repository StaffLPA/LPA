import { randomBytes } from "node:crypto";
import { Router, type IRouter } from "express";
import { and, desc, eq, inArray, isNotNull, lt } from "drizzle-orm";
import {
  announcementsTable,
  announcementAudienceTags,
  db,
  pushDevicesTable,
  usersTable,
  type Announcement,
  type User,
} from "@workspace/db";
import { requireAdmin, requireSession } from "../lib/auth";
import { announcementPlainText, sanitizeAnnouncementHtml } from "../lib/announcementContent";
import { sendAnnouncementPushNotification } from "../lib/messagePushService";

const router: IRouter = Router();
const id = () => randomBytes(16).toString("hex");
const audienceSet = new Set<string>(announcementAudienceTags);
const viewerTag = (role: string) => role === "Staff-Coach" ? "Staff-Coach" : role === "Parent-Athlete" ? "Parent" : role === "Athlete" ? "Student" : null;
const dateValue = (value: Date | null) => value?.toISOString() ?? null;
const mapAnnouncement = (announcement: Announcement) => ({
  id: announcement.id,
  title: announcement.title,
  body: announcement.body,
  durationDays: announcement.durationDays,
  publishedAt: announcement.publishedAt.toISOString(),
  expiresAt: dateValue(announcement.expiresAt),
  audienceTags: announcement.audienceTags,
  status: announcement.status,
  createdBy: announcement.createdBy,
  createdAt: announcement.createdAt.toISOString(),
  updatedAt: announcement.updatedAt.toISOString(),
});

async function expireAndList(viewer?: User) {
  const now = new Date();
  return db.transaction(async (tx) => {
    await tx.update(announcementsTable).set({ status: "expired", updatedAt: now }).where(and(eq(announcementsTable.status, "active"), isNotNull(announcementsTable.expiresAt), lt(announcementsTable.expiresAt, now)));
    const rows = await tx.select().from(announcementsTable)
      .where(viewer ? eq(announcementsTable.status, "active") : undefined)
      .orderBy(desc(announcementsTable.publishedAt));
    const tag = viewer ? viewerTag(viewer.role) : null;
    return rows.filter((announcement) => !viewer || (tag !== null && announcement.audienceTags.includes(tag)));
  });
}

function inputValues(body: unknown) {
  const input = body && typeof body === "object" ? body as Record<string, unknown> : {};
  const title = typeof input.title === "string" ? input.title.trim() : "";
  const rawBody = typeof input.body === "string" ? input.body : "";
  const sanitizedBody = sanitizeAnnouncementHtml(rawBody).trim();
  const durationDays = input.durationDays == null || input.durationDays === "" ? null : Number(input.durationDays);
  const audienceTags = Array.isArray(input.audienceTags) ? [...new Set(input.audienceTags.filter((tag): tag is string => typeof tag === "string"))] : [];
  if (!title || title.length > 200) return { error: "Title is required and must be 200 characters or fewer." };
  if (!sanitizedBody) return { error: "Announcement body is required." };
  if (durationDays !== null && (!Number.isInteger(durationDays) || durationDays < 1 || durationDays > 3650)) return { error: "Duration must be a whole number of days from 1 to 3650." };
  if (!audienceTags.length || audienceTags.some((tag) => !audienceSet.has(tag))) return { error: "Choose at least one valid audience." };
  return { title, body: sanitizedBody, durationDays, audienceTags };
}

async function notifyAnnouncement(announcement: Announcement, req: { log: { warn: (context: object, message: string) => void } }) {
  const roles = announcement.audienceTags.flatMap((tag) => tag === "Staff-Coach" ? ["Staff-Coach"] : tag === "Parent" ? ["Parent-Athlete"] : ["Athlete"]);
  const recipients = await db.select({ userId: usersTable.id }).from(usersTable)
    .where(and(eq(usersTable.status, "active"), inArray(usersTable.role, [...new Set(roles)])));
  if (!recipients.length) return;
  const devices = await db.select({ expoPushToken: pushDevicesTable.expoPushToken }).from(pushDevicesTable)
    .where(inArray(pushDevicesTable.userId, recipients.map((recipient) => recipient.userId)));
  const tokens = [...new Set(devices.map((device) => device.expoPushToken))];
  void sendAnnouncementPushNotification({
    tokens,
    title: announcement.title,
    body: announcementPlainText(announcement.body),
    announcementId: announcement.id,
  }).catch((error) => req.log.warn({ err: error, announcementId: announcement.id }, "Announcement push notification failed"));
}

router.get("/announcements", async (req, res): Promise<void> => {
  const user = await requireSession(req, res); if (!user) return;
  res.json((await expireAndList(user)).map(mapAnnouncement));
});

router.get("/admin/announcements", async (req, res): Promise<void> => {
  const user = await requireSession(req, res); if (!user || !requireAdmin(user, res)) return;
  res.json((await expireAndList()).map(mapAnnouncement));
});

router.post("/admin/announcements", async (req, res): Promise<void> => {
  const user = await requireSession(req, res); if (!user || !requireAdmin(user, res)) return;
  const input = inputValues(req.body);
  if ("error" in input) { res.status(400).json({ message: input.error }); return; }
  const publishedAt = new Date();
  const announcement = {
    id: id(), ...input, publishedAt,
    expiresAt: input.durationDays === null ? null : new Date(publishedAt.getTime() + input.durationDays * 86_400_000),
    status: "active", createdBy: user.id, createdAt: publishedAt, updatedAt: publishedAt,
  } as const;
  const [created] = await db.insert(announcementsTable).values(announcement).returning();
  void notifyAnnouncement(created, req);
  res.status(201).json(mapAnnouncement(created));
});

router.patch("/admin/announcements/:id", async (req, res): Promise<void> => {
  const user = await requireSession(req, res); if (!user || !requireAdmin(user, res)) return;
  const input = inputValues(req.body);
  if ("error" in input) { res.status(400).json({ message: input.error }); return; }
  const [existing] = await db.select().from(announcementsTable).where(eq(announcementsTable.id, req.params.id)).limit(1);
  if (!existing) { res.status(404).json({ message: "Announcement not found." }); return; }
  const expiresAt = input.durationDays === null ? null : new Date(existing.publishedAt.getTime() + input.durationDays * 86_400_000);
  const [updated] = await db.update(announcementsTable).set({ ...input, expiresAt, status: existing.status === "removed" ? "removed" : expiresAt && expiresAt < new Date() ? "expired" : "active", updatedAt: new Date() }).where(eq(announcementsTable.id, existing.id)).returning();
  res.json(mapAnnouncement(updated));
});

router.delete("/admin/announcements/:id", async (req, res): Promise<void> => {
  const user = await requireSession(req, res); if (!user || !requireAdmin(user, res)) return;
  const [removed] = await db.update(announcementsTable).set({ status: "removed", updatedAt: new Date() }).where(eq(announcementsTable.id, req.params.id)).returning({ id: announcementsTable.id });
  if (!removed) { res.status(404).json({ message: "Announcement not found." }); return; }
  res.status(204).send();
});

export default router;