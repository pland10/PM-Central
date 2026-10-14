import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { isFeatureEnabled } from "@/config/features";
import { getCurrentUser } from "@/lib/auth/supabase-server";
import {
  ensureCaptureTables,
  listPeople,
  linkedPersonFor,
  linkUser,
  chatsForPerson,
  setPrefs,
} from "@/lib/team-comms-db";

// Capture settings — which RingCentral chats each person opts in to capturing.
// Admins can manage anyone; a non-admin manages only the person their login is
// linked to. Gated on the teamComms feature.
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  if (!isFeatureEnabled("teamComms")) {
    return NextResponse.json({ error: "Team Comms is disabled." }, { status: 404 });
  }
  await ensureCaptureTables();

  const user = await getCurrentUser();
  const isAdmin = !user || user.role === "admin"; // basic-auth operator = admin
  const email = user?.email ?? null;
  const people = await listPeople();

  let selectedPersonId: string | null = null;
  let linkedPersonId: string | null = null;

  if (isAdmin) {
    const q = req.nextUrl.searchParams.get("person");
    selectedPersonId = (q && people.some((p) => p.personId === q) ? q : null) || people[0]?.personId || null;
  } else {
    linkedPersonId = email ? await linkedPersonFor(email) : null;
    selectedPersonId = linkedPersonId;
  }

  const chats = selectedPersonId ? await chatsForPerson(selectedPersonId) : [];
  const selectedName = people.find((p) => p.personId === selectedPersonId)?.personName ?? null;

  // The owner (RC_JWT, captures everything) ignores opt-in — flag it so the UI
  // can say so instead of showing toggles that do nothing.
  const ownerPersonId = process.env.RC_OWNER_PERSON_ID || "63200289004";
  const captureAll = !!selectedPersonId && selectedPersonId === ownerPersonId;

  return NextResponse.json({
    isAdmin,
    email,
    linkedPersonId,
    selectedPersonId,
    selectedName,
    captureAll,
    needsLink: !isAdmin && !linkedPersonId,
    people,
    chats,
  });
}

export async function POST(req: NextRequest) {
  if (!isFeatureEnabled("teamComms")) {
    return NextResponse.json({ error: "Team Comms is disabled." }, { status: 404 });
  }
  await ensureCaptureTables();

  const user = await getCurrentUser();
  const isAdmin = !user || user.role === "admin";
  const email = user?.email ?? null;

  const body = (await req.json().catch(() => ({}))) as {
    action?: string;
    personId?: string;
    prefs?: { chatId: string; include: boolean }[];
  };

  const people = await listPeople();
  const known = (id: string | undefined) => !!id && people.some((p) => p.personId === id);

  if (body.action === "link") {
    if (!email) return NextResponse.json({ error: "No login email to link." }, { status: 400 });
    if (!known(body.personId)) return NextResponse.json({ error: "Unknown person." }, { status: 400 });
    // A non-admin may only claim an identity that isn't already someone else's.
    if (!isAdmin) {
      const current = await linkedPersonFor(email);
      // Does this person already belong to a different email? Block unless admin.
      const takenBy = await linkedEmailOwner(body.personId!, email);
      if (takenBy && takenBy !== email && current !== body.personId) {
        return NextResponse.json(
          { error: "That person is already linked to another account. Ask an admin." },
          { status: 403 }
        );
      }
    }
    await linkUser(email, body.personId!);
    return NextResponse.json({ ok: true });
  }

  if (body.action === "prefs") {
    if (!known(body.personId)) return NextResponse.json({ error: "Unknown person." }, { status: 400 });
    if (!isAdmin) {
      const linked = email ? await linkedPersonFor(email) : null;
      if (!linked || linked !== body.personId) {
        return NextResponse.json({ error: "You can only change your own capture settings." }, { status: 403 });
      }
    }
    const prefs = Array.isArray(body.prefs)
      ? body.prefs.filter((p) => p && typeof p.chatId === "string" && typeof p.include === "boolean")
      : [];
    await setPrefs(body.personId!, prefs);
    return NextResponse.json({ ok: true, saved: prefs.length });
  }

  return NextResponse.json({ error: "Unknown action." }, { status: 400 });
}

// Which email (if any) already claims this person. Used to stop a non-admin
// from claiming an identity that's already someone else's.
async function linkedEmailOwner(personId: string, _email: string): Promise<string | null> {
  const rows = await prisma.$queryRaw<{ pmc_email: string }[]>(
    Prisma.sql`SELECT pmc_email FROM rc_user_links WHERE person_id = ${personId} LIMIT 1`
  );
  return rows[0]?.pmc_email ?? null;
}
