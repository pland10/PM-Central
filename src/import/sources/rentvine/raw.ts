// Raw Rentvine records — the shape data comes OUT of Rentvine in. Kept separate
// from the canonical model on purpose: another PMS gets its own raw types and
// its own transform, and neither the loader nor the canonical model changes.

export interface RvProperty {
  id: number;
  street: string;
  city: string;
  state: string;
  zip: string;
  type: string; // Rentvine's label, e.g. "Single Family Home"
}

export interface RvLease {
  prop: number; // Rentvine property id
  leaseId?: number;
  tenant: string; // primary tenant display name
  email?: string;
  phone?: string;
  start: string;
  end: string;
  rent?: number;
}

export interface RvWorkOrder {
  id: number;
  prop: number; // Rentvine property id
  desc: string;
  priority: string; // "low" | "normal" | "high"
}

export interface RentvineExport {
  account: string; // which Rentvine company, e.g. "pmilighthouse"
  properties: RvProperty[];
  activeLeases: RvLease[];
  workOrders: RvWorkOrder[];
}

// A Rentvine source yields a raw export for one account. Today that's a bundled
// snapshot (staticSource). A live implementation calls the Rentvine API with
// that account's credentials + subdomain — see client.ts — and returns the same
// RentvineExport shape, so nothing downstream changes.
export interface RentvineSource {
  extract(): Promise<RentvineExport>;
}

export function staticSource(data: RentvineExport): RentvineSource {
  return { extract: async () => data };
}
