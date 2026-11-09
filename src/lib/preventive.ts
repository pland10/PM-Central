// Preventive (scheduled/routine) maintenance vs. reactive repairs.
//
// Source of truth, in order: a Rentvine recurring work order (every WO it
// creates carries recurringWorkOrderID — synced into rv_work_orders.recurring),
// then the title. Rentvine has no recurring WOs set up yet and tune-ups are
// typed by hand ("HVAC Tuneup", "HVAC tune up", …), so the title rules carry it
// for now. Add a pattern here for any new kind of routine job.
const PREVENTIVE_PATTERNS: RegExp[] = [
  /\btune[\s-]?ups?\b/i, // HVAC tune-up / tuneup / tune up
  /\bsprinkler\b.*\bwinteri[sz]/i, // sprinkler winterization
  /\bwinteri[sz]\w*\b.*\bsprinkler/i, // winterize sprinklers
];

export function isPreventiveTitle(title: string | null | undefined): boolean {
  const t = title ?? "";
  return PREVENTIVE_PATTERNS.some((re) => re.test(t));
}
