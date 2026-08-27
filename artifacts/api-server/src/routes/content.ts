import { Router, type IRouter } from "express";
import { inArray } from "drizzle-orm";
import { appSettingsTable, db } from "@workspace/db";
import { requireAdmin, requireSession } from "../lib/auth";
import { createManagedImageAccessURL, createManagedImageUpload, isManagedImagePath } from "../lib/managedImageStorage";

const router: IRouter = Router();
const kinds = ["weekly-schedule", "lunch-program"] as const;
type ImageKind = typeof kinds[number];
const value = (input: unknown) => typeof input === "string" && input.trim() ? input.trim() : null;
const isKind = (input: unknown): input is ImageKind => typeof input === "string" && kinds.includes(input as ImageKind);

async function getImages() {
  const settings = await db.select().from(appSettingsTable).where(inArray(appSettingsTable.key, kinds));
  const result: Record<string, unknown> = {};
  for (const setting of settings) {
    try {
      const parsed = JSON.parse(setting.value) as { objectPath?: string; width?: number; height?: number };
      if (!parsed.objectPath || !isManagedImagePath(parsed.objectPath)) continue;
      result[setting.key] = { uri: await createManagedImageAccessURL(parsed.objectPath), width: parsed.width, height: parsed.height };
    } catch { /* A bad content record should not break the rest of the app. */ }
  }
  return result;
}

router.get("/schedule-images", async (req, res) => {
  const user = await requireSession(req, res); if (!user) return;
  res.json(await getImages());
});

router.post("/admin/schedule-images/upload-url", async (req, res) => {
  const user = await requireSession(req, res); if (!user || !requireAdmin(user, res)) return;
  const kind = req.body.kind;
  const contentType = value(req.body.contentType);
  const size = Number(req.body.size);
  const width = Number(req.body.width), height = Number(req.body.height);
  if (!isKind(kind) || !contentType || !/^image\/(?:jpeg|png|webp)$/.test(contentType) || !Number.isFinite(size) || size < 1 || size > 10 * 1024 * 1024 || !Number.isFinite(width) || !Number.isFinite(height) || width < 1 || height < 1) {
    res.status(400).json({ message: "Choose a JPEG, PNG, or WebP image up to 10 MB." }); return;
  }
  const upload = await createManagedImageUpload(kind);
  res.status(201).json(upload);
});

router.patch("/admin/schedule-images", async (req, res) => {
  const user = await requireSession(req, res); if (!user || !requireAdmin(user, res)) return;
  const kind = req.body.kind, objectPath = value(req.body.objectPath);
  const width = Number(req.body.width), height = Number(req.body.height);
  if (!isKind(kind) || !objectPath || !isManagedImagePath(objectPath) || !Number.isFinite(width) || !Number.isFinite(height) || width < 1 || height < 1) {
    res.status(400).json({ message: "The schedule image is invalid. Please upload it again." }); return;
  }
  await db.insert(appSettingsTable).values({ key: kind, value: JSON.stringify({ objectPath, width, height }) }).onConflictDoUpdate({
    target: appSettingsTable.key,
    set: { value: JSON.stringify({ objectPath, width, height }), updatedAt: new Date() },
  });
  res.json(await getImages());
});

export default router;