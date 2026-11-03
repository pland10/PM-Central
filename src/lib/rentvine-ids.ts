// Property.externalId is namespaced by the importer ("<account>:property:<id>",
// see src/import/load.ts), while raw Rentvine tables (rentvine_units) and the
// Rentvine API use the bare propertyID. This gets the bare id from either.
export function rentvinePropertyId(externalId: string | null | undefined): string {
  if (!externalId) return "";
  return String(externalId).split(":").pop() ?? "";
}
