import { createHmac, timingSafeEqual } from "node:crypto";
import type { Request, Response } from "express";
import { eq } from "drizzle-orm";
import { db, usersTable, type User } from "@workspace/db";

const sessionLifetimeSeconds = 60 * 60 * 24 * 30;

function secret() {
  const value = process.env.SESSION_SECRET;
  if (!value) throw new Error("SESSION_SECRET must be configured.");
  return value;
}

function signature(payload: string) {
  return createHmac("sha256", secret()).update(payload).digest("base64url");
}

export function createSession(user: Pick<User, "id">) {
  const payload = Buffer.from(JSON.stringify({ userId: user.id, exp: Math.floor(Date.now() / 1000) + sessionLifetimeSeconds })).toString("base64url");
  return `${payload}.${signature(payload)}`;
}

export async function authenticatedUser(req: Request) {
  const header = req.header("authorization");
  const token = header?.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token) return null;
  const [payload, provided] = token.split(".");
  if (!payload || !provided) return null;
  const expected = signature(payload);
  if (provided.length !== expected.length || !timingSafeEqual(Buffer.from(provided), Buffer.from(expected))) return null;
  try {
    const data = JSON.parse(Buffer.from(payload, "base64url").toString()) as { userId?: string; exp?: number };
    if (!data.userId || !data.exp || data.exp < Math.floor(Date.now() / 1000)) return null;
    const [user] = await db.select().from(usersTable).where(eq(usersTable.id, data.userId));
    return user?.status === "active" && user.passwordHash ? user : null;
  } catch {
    return null;
  }
}

export async function requireSession(req: Request, res: Response) {
  const user = await authenticatedUser(req);
  if (!user) {
    res.status(401).json({ message: "A valid active session is required." });
    return null;
  }
  return user;
}

export function requireAdmin(user: User, res: Response) {
  if (user.role !== "Admin" && user.role !== "Staff-Coach") {
    res.status(403).json({ message: "Admin or Staff-Coach access is required." });
    return false;
  }
  return true;
}

export function requireStaff(user: User, res: Response) {
  if (user.role !== "Admin" && user.role !== "Staff-Coach") {
    res.status(403).json({ message: "Staff or admin access is required." });
    return false;
  }
  return true;
}