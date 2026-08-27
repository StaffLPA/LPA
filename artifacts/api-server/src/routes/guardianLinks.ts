import { randomBytes } from "node:crypto";
import { and, desc, eq, inArray } from "drizzle-orm";
import { Router, type IRouter, type Response } from "express";
import {
  calendarEventsTable,
  db,
  guardianLinksTable,
  usersTable,
  type GuardianLink,
  type User,
} from "@workspace/db";
import {
  CreateGuardianLinkBody,
  CreateGuardianLinkResponse,
  DeleteGuardianLinkParams,
  ListGuardianLinksResponse,
  ListLinkedAthleteCalendarEventsParams,
  ListLinkedAthleteCalendarEventsResponse,
  ListLinkedAthletesResponse,
} from "@workspace/api-zod";
import { requireSession } from "../lib/auth";
import { createProfilePhotoAccessURL, isProfilePhotoPath } from "../lib/profilePhotoStorage";

const router: IRouter = Router();

function normalizedTeam(value: string) {
  return value.trim().toLowerCase().replace(/[^a-z0-9]/g, "");
}

function teamKey(value: string) {
  const normalized = normalizedTeam(value);
  if (["lpa14u", "14u"].includes(normalized)) return "14u";
  if (["lpa15u", "15u"].includes(normalized)) return "15u";
  if (["lpajv", "jv", "juniorvarsity"].includes(normalized)) return "jv";
  if (["lpavarsity", "varsity"].includes(normalized)) return "varsity";
  return normalized;
}

function eventIsForTeams(eventTeam: string, teams: string[]) {
  if (["lpa", "lpaevents", "alllpaevents", "allteams"].includes(normalizedTeam(eventTeam))) return true;
  const eventKey = teamKey(eventTeam);
  return teams.some((team) => teamKey(team) === eventKey);
}

function requireFullAdmin(user: User, res: Response) {
  if (user.role !== "Admin") {
    res.status(403).json({ message: "Only full Admins can manage athlete and guardian links." });
    return false;
  }
  return true;
}

function requireGuardian(user: User, res: Response) {
  if (user.role !== "Parent-Athlete") {
    res.status(403).json({ message: "Parent or guardian access is required." });
    return false;
  }
  return true;
}

async function profilePhotoUrl(path: string | null) {
  if (!path) return null;
  if (!isProfilePhotoPath(path)) return null;
  try {
    return await createProfilePhotoAccessURL(path);
  } catch {
    return null;
  }
}

async function mapAthlete(user: User) {
  return {
    id: user.id,
    fullName: user.fullName,
    firstName: user.firstName,
    lastName: user.lastName,
    gradYear: user.gradYear,
    role: "Athlete" as const,
    teams: user.teams,
    profilePhotoUri: await profilePhotoUrl(user.profilePhotoUri),
  };
}

async function mapGuardian(user: User) {
  return {
    id: user.id,
    fullName: user.fullName,
    role: "Parent-Athlete" as const,
    profilePhotoUri: await profilePhotoUrl(user.profilePhotoUri),
  };
}

async function usersById(ids: string[]) {
  if (!ids.length) return new Map<string, User>();
  const users = await db.select().from(usersTable).where(inArray(usersTable.id, ids));
  return new Map(users.map((user) => [user.id, user]));
}

async function mapLink(link: GuardianLink, users: Map<string, User>) {
  const athlete = users.get(link.athleteId);
  const guardian = users.get(link.guardianId);
  if (!athlete || !guardian) return null;
  return {
    id: link.id,
    athlete: await mapAthlete(athlete),
    guardian: await mapGuardian(guardian),
    createdAt: link.createdAt.toISOString(),
  };
}

async function findLinkedAthlete(guardianId: string, athleteId: string) {
  const [link] = await db.select().from(guardianLinksTable).where(and(
    eq(guardianLinksTable.guardianId, guardianId),
    eq(guardianLinksTable.athleteId, athleteId),
  ));
  if (!link) return null;
  const [athlete] = await db.select().from(usersTable).where(and(
    eq(usersTable.id, athleteId),
    eq(usersTable.role, "Athlete"),
    eq(usersTable.status, "active"),
  ));
  return athlete ?? null;
}

router.get("/admin/guardian-links", async (req, res): Promise<void> => {
  const admin = await requireSession(req, res);
  if (!admin || !requireFullAdmin(admin, res)) return;
  const links = await db.select().from(guardianLinksTable).orderBy(desc(guardianLinksTable.createdAt));
  const people = await usersById([...new Set(links.flatMap((link) => [link.athleteId, link.guardianId]))]);
  const mapped = (await Promise.all(links.map((link) => mapLink(link, people)))).filter((link): link is NonNullable<typeof link> => Boolean(link));
  res.json(ListGuardianLinksResponse.parse(mapped));
});

router.post("/admin/guardian-links", async (req, res): Promise<void> => {
  const admin = await requireSession(req, res);
  if (!admin || !requireFullAdmin(admin, res)) return;
  const input = CreateGuardianLinkBody.safeParse(req.body);
  if (!input.success) {
    res.status(400).json({ message: "Select one athlete and one parent or guardian." });
    return;
  }
  if (input.data.athleteId === input.data.guardianId) {
    res.status(400).json({ message: "An athlete cannot be linked to the same account as a guardian." });
    return;
  }
  const outcome = await db.transaction(async (tx) => {
    const people = await tx.select().from(usersTable).where(inArray(usersTable.id, [input.data.athleteId, input.data.guardianId]));
    const athlete = people.find((user) => user.id === input.data.athleteId);
    const guardian = people.find((user) => user.id === input.data.guardianId);
    if (!athlete || !guardian) return { kind: "error", status: 404, message: "The athlete or parent/guardian account was not found." } as const;
    if (athlete.role !== "Athlete" || guardian.role !== "Parent-Athlete") return { kind: "error", status: 400, message: "Choose an Athlete account and an active Parent/Guardian account." } as const;
    if (athlete.status !== "active" || guardian.status !== "active") return { kind: "error", status: 400, message: "Both the athlete and parent/guardian must be active." } as const;
    const [existing] = await tx.select({ id: guardianLinksTable.id }).from(guardianLinksTable).where(and(
      eq(guardianLinksTable.athleteId, athlete.id),
      eq(guardianLinksTable.guardianId, guardian.id),
    ));
    if (existing) return { kind: "error", status: 409, message: "This athlete is already linked to that parent or guardian." } as const;
    const [link] = await tx.insert(guardianLinksTable).values({
      id: randomBytes(16).toString("hex"),
      athleteId: athlete.id,
      guardianId: guardian.id,
      createdBy: admin.id,
    }).returning();
    return { kind: "success", link, athlete, guardian } as const;
  });
  if (outcome.kind === "error") {
    res.status(outcome.status).json({ message: outcome.message });
    return;
  }
  const response = {
    id: outcome.link.id,
    athlete: await mapAthlete(outcome.athlete),
    guardian: await mapGuardian(outcome.guardian),
    createdAt: outcome.link.createdAt.toISOString(),
  };
  res.status(201).json(CreateGuardianLinkResponse.parse(response));
});

router.delete("/admin/guardian-links/:id", async (req, res): Promise<void> => {
  const admin = await requireSession(req, res);
  if (!admin || !requireFullAdmin(admin, res)) return;
  const params = DeleteGuardianLinkParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ message: "A valid relationship ID is required." });
    return;
  }
  const [removed] = await db.delete(guardianLinksTable).where(eq(guardianLinksTable.id, params.data.id)).returning({ id: guardianLinksTable.id });
  if (!removed) {
    res.status(404).json({ message: "Athlete and guardian relationship not found." });
    return;
  }
  res.status(204).send();
});

router.get("/guardian/athletes", async (req, res): Promise<void> => {
  const guardian = await requireSession(req, res);
  if (!guardian || !requireGuardian(guardian, res)) return;
  const links = await db.select().from(guardianLinksTable).where(eq(guardianLinksTable.guardianId, guardian.id));
  const athletes = links.length
    ? await db.select().from(usersTable).where(and(inArray(usersTable.id, links.map((link) => link.athleteId)), eq(usersTable.role, "Athlete"), eq(usersTable.status, "active")))
    : [];
  res.json(ListLinkedAthletesResponse.parse(await Promise.all(athletes.map(mapAthlete))));
});

router.get("/guardian/athletes/:athleteId/calendar-events", async (req, res): Promise<void> => {
  const guardian = await requireSession(req, res);
  if (!guardian || !requireGuardian(guardian, res)) return;
  const params = ListLinkedAthleteCalendarEventsParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ message: "A valid athlete ID is required." });
    return;
  }
  const athlete = await findLinkedAthlete(guardian.id, params.data.athleteId);
  if (!athlete) {
    res.status(404).json({ message: "Linked athlete not found." });
    return;
  }
  const events = (await db.select().from(calendarEventsTable).orderBy(desc(calendarEventsTable.date), desc(calendarEventsTable.time)))
    .filter((event) => eventIsForTeams(event.team, athlete.teams))
    .map((event) => ({ ...event, createdAt: event.createdAt.toISOString(), updatedAt: event.updatedAt.toISOString() }));
  res.json(ListLinkedAthleteCalendarEventsResponse.parse(events));
});

export default router;