import { prisma } from "@/lib/prisma";
import { resolveCategoryForSave } from "@/lib/transaction-categories-db";
import { unitBelongsToProperty } from "@/lib/rentvine-units";
import type { AnnotationPatch } from "@/lib/transactions-view";

// Server-side checks for a transaction (or split-line) edit, shared by the
// row PATCH, the split-line PATCH and saving a split:
//   - a typed category is checked against the shared list: look-alikes save
//     under the list's spelling, new ones are added while the list is open, and
//     a locked list refuses unknown ones (admins excepted);
//   - only an existing property can be linked, and a unit always travels with
//     its property (changing the property without a unit clears the unit; a
//     unit must belong to that property).
// Mutates and returns the patch, or an error to send back.
export async function checkAnnotationPatch(
  patch: AnnotationPatch,
  user: { email?: string | null; role?: string | null } | null
): Promise<{ patch: AnnotationPatch } | { error: string; status: number }> {
  if (patch.categoryOverride) {
    const decision = await resolveCategoryForSave(patch.categoryOverride, {
      isAdmin: !user || user.role === "admin", // basic-auth operator = admin
      by: user?.email ?? "operator",
    });
    if ("error" in decision) return { error: decision.error, status: 400 };
    patch.categoryOverride = decision.name;
  }

  if (patch.propertyId !== undefined && patch.unitId === undefined) patch.unitId = null;
  if (patch.unitId && !patch.propertyId) return { error: "Pick a property from the list.", status: 400 };
  if (patch.propertyId) {
    const exists = await prisma.property.findFirst({ where: { externalId: patch.propertyId }, select: { id: true } });
    if (!exists) return { error: "Pick a property from the list.", status: 400 };
    if (patch.unitId && !(await unitBelongsToProperty(prisma, patch.unitId, patch.propertyId))) {
      return { error: "That unit isn't part of the property — pick from the list.", status: 400 };
    }
  }
  return { patch };
}
