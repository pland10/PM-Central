// The canonical model — the shape our system imports, independent of any PMS.
// Every source (Rentvine today, others later) transforms its own records into
// this shape, and the generic loader is the only thing that writes to the DB.
//
// `externalId` on each entity is the stable id *within its source account* —
// the loader namespaces it by account before storage, so two companies (or two
// PMSs) never collide.

export interface CanonicalTenant {
  externalId: string;
  firstName?: string | null;
  lastName?: string | null;
  companyName?: string | null;
  email?: string | null;
  phone?: string | null;
}

export interface CanonicalLease {
  externalId: string;
  status: string;
  rent: number;
  balanceDue?: number;
  depositBalance?: number;
  startDate?: string | null; // ISO date
  endDate?: string | null;
  tenants: CanonicalTenant[];
}

export interface CanonicalUnit {
  externalId: string;
  unitNumber: string;
  status: string;
  beds?: number | null;
  baths?: number | null;
  sqft?: number | null;
  marketRent?: number | null;
  lease?: CanonicalLease | null;
}

export interface CanonicalOwner {
  externalId: string; // stable id of the owning entity (e.g. portfolio id)
  name: string;
}

export interface CanonicalProperty {
  externalId: string;
  name?: string | null;
  street1: string;
  street2?: string | null;
  city: string;
  state: string;
  zip: string;
  propertyType: string;
  status: string;
  // Program/group tags as normalized slugs (e.g. ["squatterwatch"]).
  tags?: string[];
  owner?: CanonicalOwner | null;
  units: CanonicalUnit[];
}

export interface CanonicalWorkOrder {
  externalId: string;
  propertyExternalId: string;
  title: string;
  description?: string | null;
  status: string;
  priority: string;
}

export interface CanonicalDataset {
  source: string; // the PMS, e.g. "rentvine"
  account: string; // which company/account, e.g. "pmilighthouse"
  properties: CanonicalProperty[];
  workOrders: CanonicalWorkOrder[];
}
