import { randomBytes, scryptSync, createHash, timingSafeEqual } from "node:crypto";
import { Router, type IRouter } from "express";
import { and, arrayContains, eq, gt, ilike, inArray, or, sql } from "drizzle-orm";
import { db, usersTable, type User } from "@workspace/db";
import { sendInviteNotification } from "../lib/notificationService";
import { createSession, requireAdmin, requireSession, requireStaff } from "../lib/auth";

const router: IRouter = Router();
const roles = new Set(["Admin", "Staff-Coach", "Parent-Athlete", "Athlete"]);
const allowedTeams = new Set(["LPA 14U", "LPA 15U", "LPA JV", "LPA Varsity", "LPA"]);
const value = (input: unknown) => typeof input === "string" && input.trim() ? input.normalize("NFKC").trim() : null;
const email = (input: unknown) => {
  const raw = value(input);
  return raw ? raw.toLocaleLowerCase() : null;
};
const phone = (input: unknown) => {
  const raw = value(input);
  if (!raw) return null;
  const digits = raw.replace(/\D/g, "");
  if (!digits) return null;
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  return `+${digits}`;
};
const phoneVariants = (input: string | null) => {
  if (!input) return [];
  const digits = input.replace(/\D/g, "");
  return [...new Set([input, digits, `+${digits}`, digits.length === 11 && digits.startsWith("1") ? digits.slice(1) : ""])].filter(Boolean);
};
const mapUser = (user: User) => ({ id: user.id, fullName: user.fullName, firstName: user.firstName, lastName: user.lastName, email: user.email, phone: user.phone, address: user.address, birthday: user.birthday, gender: user.gender, profilePhotoUri: user.profilePhotoUri, role: user.role, status: user.status, teams: user.teams, invitedAt: user.invitedAt.toISOString(), inviteExpiresAt: user.inviteTokenExpiresAt?.toISOString() ?? null });
const mapDirectoryUser = (user: User) => ({ id: user.id, fullName: user.fullName, role: user.role, status: user.status, teams: user.teams, profilePhotoUri: user.profilePhotoUri });
const newInvite = () => { const token = randomBytes(32).toString("hex"); return { tokenHash: createHash("sha256").update(token).digest("hex"), expiresAt: new Date(Date.now() + 7 * 86400000) }; };
async function matchingUsers(userEmail: string | null, userPhone: string | null) {
  const conditions = [
    userEmail ? sql`lower(${usersTable.email}) = ${userEmail}` : undefined,
    userPhone ? inArray(usersTable.phone, phoneVariants(userPhone)) : undefined,
  ].filter((item): item is NonNullable<typeof item> => Boolean(item));
  if (!conditions.length) return [];
  const candidates = await db.select().from(usersTable).where(or(...conditions));
  return candidates.filter((candidate) => (
    (userEmail !== null && email(candidate.email) === userEmail)
    || (userPhone !== null && phone(candidate.phone) === userPhone)
  ));
}
function lookupState(user: User | undefined) {
  if (!user) return "not_found" as const;
  if (user.status === "active") return "completed" as const;
  if (user.status === "revoked") return "revoked" as const;
  if (user.status === "invited" && (!user.inviteTokenExpiresAt || user.inviteTokenExpiresAt <= new Date())) return "expired" as const;
  return user.status === "invited" ? "ready" as const : "not_found" as const;
}
function passwordMatches(password: string, user: User) {
  if (!user.passwordHash) return false;
  const candidate = scryptSync(password, user.id, 64), stored = Buffer.from(user.passwordHash, "hex");
  return stored.length === candidate.length && timingSafeEqual(stored, candidate);
}

router.post("/admin/invites", async (req, res) => {
  const actor = await requireSession(req, res); if (!actor || !requireAdmin(actor, res)) return;
  const fullName = value(req.body.fullName), userEmail = email(req.body.email), userPhone = phone(req.body.phone), role = value(req.body.role);
  const teams = Array.isArray(req.body.teams) ? req.body.teams.filter((team: unknown): team is string => typeof team === "string" && allowedTeams.has(team)) : [];
  if (!fullName || !role || !roles.has(role) || !userEmail) { res.status(400).json({ message: "Name, a valid role, and an email address are required." }); return; }
  const matches = await matchingUsers(userEmail, userPhone);
  if (matches.length > 1) { res.status(409).json({ message: "The email and phone belong to different user records. Resolve the conflict before inviting." }); return; }
  if (matches[0]?.status === "active") { res.status(409).json({ message: "This person is already an active user." }); return; }
  const invite = newInvite();
  const [user] = matches[0] ? await db.update(usersTable).set({ fullName, email: userEmail, phone: userPhone, role, teams, status: "invited", inviteTokenHash: invite.tokenHash, inviteTokenExpiresAt: invite.expiresAt, invitedAt: new Date(), invitedBy: actor.id }).where(eq(usersTable.id, matches[0].id)).returning() : await db.insert(usersTable).values({ id: randomBytes(16).toString("hex"), fullName, email: userEmail, phone: userPhone, role, teams, status: "invited", inviteTokenHash: invite.tokenHash, inviteTokenExpiresAt: invite.expiresAt, invitedBy: actor.id }).returning();
  try { await sendInviteNotification({ fullName: user.fullName, email: user.email, phone: user.phone, role: user.role }); } catch (error) { req.log.error({ err: error, userId: user.id }, "Invite delivery failed"); res.status(502).json({ message: "Invite was saved, but delivery failed." }); return; }
  res.status(201).json(mapUser(user));
});

router.get("/admin/users", async (req, res) => {
  const actor = await requireSession(req, res); if (!actor || !requireAdmin(actor, res)) return;
  const search = value(req.query.search), role = value(req.query.role), team = value(req.query.team);
  const conditions = [search ? ilike(usersTable.fullName, `%${search}%`) : undefined, role && roles.has(role) ? eq(usersTable.role, role) : undefined, team && allowedTeams.has(team) ? arrayContains(usersTable.teams, [team]) : undefined].filter((item): item is NonNullable<typeof item> => Boolean(item));
  res.json((await db.select().from(usersTable).where(conditions.length ? and(...conditions) : undefined)).map(mapUser));
});
router.get("/users", async (req, res) => {
  const actor = await requireSession(req, res); if (!actor) return;
  res.json((await db.select().from(usersTable).where(inArray(usersTable.status, ["active", "invited"]))).map(mapDirectoryUser));
});
router.patch("/admin/users/:id/role", async (req, res) => {
  const actor = await requireSession(req, res); if (!actor || !requireAdmin(actor, res)) return;
  const role = value(req.body.role);
  if (!role || !roles.has(role)) { res.status(400).json({ message: "Select a valid role." }); return; }
  const outcome = await db.transaction(async (tx) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(7318051)`);
    const [user] = await tx.select().from(usersTable).where(eq(usersTable.id, req.params.id));
    if (!user) return { kind: "error", status: 404, message: "User not found." } as const;
    if (user.role === "Admin" && user.status === "active" && role !== "Admin") {
      const activeAdmins = await tx.select({ id: usersTable.id }).from(usersTable).where(and(eq(usersTable.role, "Admin"), eq(usersTable.status, "active")));
      if (activeAdmins.length <= 1) return { kind: "error", status: 409, message: "Transfer Admin access before removing the last active Admin." } as const;
    }
    const [updated] = await tx.update(usersTable).set({ role }).where(eq(usersTable.id, user.id)).returning();
    if (!updated) return { kind: "error", status: 404, message: "User not found." } as const;
    return { kind: "success", updated } as const;
  });
  if (outcome.kind === "error") { res.status(outcome.status).json({ message: outcome.message }); return; }
  res.json(mapUser(outcome.updated));
});
router.patch("/admin/users/:id/team", async (req, res) => {
  const actor = await requireSession(req, res); if (!actor || !requireAdmin(actor, res)) return;
  const teams = Array.isArray(req.body.teams) ? req.body.teams.filter((team: unknown): team is string => typeof team === "string" && allowedTeams.has(team)) : [];
  if (!teams.length) { res.status(400).json({ message: "Select at least one LPA team." }); return; }
  const [updated] = await db.update(usersTable).set({ teams }).where(eq(usersTable.id, req.params.id)).returning();
  if (!updated) { res.status(404).json({ message: "User not found." }); return; }
  res.json(mapUser(updated));
});

for (const action of ["resend", "revoke"] as const) router.post(`/admin/invites/:id/${action}`, async (req, res) => {
  const actor = await requireSession(req, res); if (!actor || !requireAdmin(actor, res)) return;
  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, req.params.id));
  if (!user) { res.status(404).json({ message: "User not found." }); return; }
  if (action === "revoke") {
    if (user.status === "active") { res.status(409).json({ message: "Active users cannot be revoked. Update their role instead." }); return; }
    const [updated] = await db.update(usersTable).set({ status: "revoked", inviteTokenHash: null, inviteTokenExpiresAt: null }).where(eq(usersTable.id, user.id)).returning(); res.json(mapUser(updated)); return;
  }
  if (user.status === "active") { res.status(409).json({ message: "This person is already an active user." }); return; }
  const invite = newInvite();
  const [updated] = await db.update(usersTable).set({ status: "invited", inviteTokenHash: invite.tokenHash, inviteTokenExpiresAt: invite.expiresAt, invitedAt: new Date() }).where(eq(usersTable.id, user.id)).returning();
  try { await sendInviteNotification({ fullName: updated.fullName, email: updated.email, phone: updated.phone, role: updated.role }); } catch (error) { req.log.error({ err: error, userId: updated.id }, "Resend failed"); res.status(502).json({ message: "Invite was refreshed, but delivery failed." }); return; }
  res.json(mapUser(updated));
});

router.post("/onboarding/lookup", async (req, res) => {
  const identifier = value(req.body.identifier); if (!identifier) { res.status(400).json({ message: "Enter the email or phone number from your invite." }); return; }
  const isEmail = identifier.includes("@");
  const matches = await matchingUsers(isEmail ? email(identifier) : null, isEmail ? null : phone(identifier));
  const user = matches.length === 1 ? matches[0] : undefined;
  const state = lookupState(user);
  res.json({ found: state === "ready", state, user: state === "ready" && user ? mapUser(user) : null });
});
router.post("/onboarding/complete", async (req, res) => {
  const userId = value(req.body.userId), fullName = value(req.body.fullName), password = value(req.body.password);
  if (!userId || !fullName || !password || password.length < 8) { res.status(400).json({ message: "Confirm your name and use a password with at least 8 characters." }); return; }
  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, userId));
  if (!user || lookupState(user) !== "ready") { res.status(400).json({ message: "This invite is no longer valid. Contact your administrator." }); return; }
  const [updated] = await db.update(usersTable).set({ fullName, status: "active", passwordHash: scryptSync(password, user.id, 64).toString("hex"), inviteTokenHash: null, inviteTokenExpiresAt: null, usedAt: new Date() }).where(and(eq(usersTable.id, user.id), eq(usersTable.status, "invited"), gt(usersTable.inviteTokenExpiresAt, new Date()))).returning();
  if (!updated) { res.status(409).json({ message: "This invite was already used or expired. Contact your administrator." }); return; }
  res.json({ user: mapUser(updated), sessionToken: createSession(updated) });
});
router.post("/auth/sign-in", async (req, res) => {
  const identifier = value(req.body.identifier), password = value(req.body.password), user = identifier ? (await matchingUsers(email(identifier), phone(identifier)))[0] : null;
  if (!identifier || !password) { res.status(400).json({ message: "Enter your email or phone number and password." }); return; }
  if (!user || user.status !== "active" || !passwordMatches(password, user)) { res.status(401).json({ message: "The sign-in details are incorrect." }); return; }
  res.json({ user: mapUser(user), sessionToken: createSession(user) });
});
router.get("/auth/me", async (req, res) => { const user = await requireSession(req, res); if (user) res.json(mapUser(user)); });
router.patch("/auth/profile", async (req, res) => {
  const user = await requireSession(req, res); if (!user) return;
  const userEmail = email(req.body.email), userPhone = phone(req.body.phone);
  if (!userEmail && !userPhone) { res.status(400).json({ message: "Email or mobile number is required." }); return; }
  const duplicate = await matchingUsers(userEmail, userPhone);
  if (duplicate.some((candidate) => candidate.id !== user.id)) { res.status(409).json({ message: "That email or mobile number is already in use." }); return; }
  const firstName = value(req.body.firstName), lastName = value(req.body.lastName);
  const fullName = [firstName, lastName].filter(Boolean).join(" ") || value(req.body.fullName) || user.fullName;
  const [updated] = await db.update(usersTable).set({
    fullName,
    firstName,
    lastName,
    email: userEmail,
    phone: userPhone,
    address: value(req.body.address),
    birthday: value(req.body.birthday),
    gender: value(req.body.gender),
    profilePhotoUri: value(req.body.profilePhotoUri),
  }).where(eq(usersTable.id, user.id)).returning();
  res.json(mapUser(updated));
});
router.post("/auth/change-password", async (req, res) => {
  const user = await requireSession(req, res); if (!user) return;
  const currentPassword = value(req.body.currentPassword), newPassword = value(req.body.newPassword);
  if (!currentPassword || !newPassword || newPassword.length < 8) { res.status(400).json({ message: "Enter your current password and a new password with at least 8 characters." }); return; }
  if (!passwordMatches(currentPassword, user)) { res.status(401).json({ message: "Your current password is incorrect." }); return; }
  const [updated] = await db.update(usersTable).set({ passwordHash: scryptSync(newPassword, user.id, 64).toString("hex") }).where(eq(usersTable.id, user.id)).returning();
  res.json({ message: "Password updated successfully.", user: mapUser(updated) });
});
export default router;