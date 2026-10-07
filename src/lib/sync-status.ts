import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

// Reads the sync heartbeats from the Neon `sync_status` table that every sync
// writes (job, last_run_at, detail). Server-only. Returns {} on error so the
// admin page degrades gracefully.

export type SyncStatusRow = {
  job: string;
  last_run_at: Date | null;
  detail: string | null;
};

export async function getSyncStatusMap(): Promise<Record<string, SyncStatusRow>> {
  try {
    const rows = await prisma.$queryRaw<SyncStatusRow[]>(
      Prisma.sql`SELECT job, last_run_at, detail FROM sync_status`
    );
    return Object.fromEntries(rows.map((r) => [r.job, r]));
  } catch {
    return {};
  }
}
