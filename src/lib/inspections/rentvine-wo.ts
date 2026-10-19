// Server-only: create a Rentvine work order via the Manager REST API.
//
// The app already reads Rentvine over this API (src/import/sources/rentvine/
// client.ts); this is the one write path. It needs RENTVINE_API_KEY +
// RENTVINE_API_SECRET and a base URL (RENTVINE_BASE_URL, e.g.
// https://pmilighthouse.rentvine.com/api/manager) on the PM-Central service.
//
// Used by the inspection "create work order" resolution: an inspection flagged
// "Needs attention" can be turned into a real Rentvine work order on its
// property. A failed POST creates nothing — the error is returned for display.

export type CreateWorkOrderInput = {
  propertyId: string; // Rentvine propertyID (InspectProperty.rv_id)
  description: string;
  priorityId?: number; // 1=Low, 2=Medium, 3=High (default Medium)
  workOrderStatusId?: number; // default 4 = Requested (intake)
  unitId?: string | null;
};

export type CreateWorkOrderResult =
  | { ok: true; ref: string; id: string }
  | { ok: false; status: number; error: string };

const DEFAULT_PRIORITY = 2; // Medium
const DEFAULT_STATUS = 4; // Requested (pending intake), per list_work_order_statuses

export function isRentvineConfigured(): boolean {
  return Boolean(
    (process.env.RENTVINE_API_KEY || "") && (process.env.RENTVINE_API_SECRET || "")
  );
}

function baseUrl(): string {
  const explicit = (process.env.RENTVINE_BASE_URL || "").trim().replace(/\/$/, "");
  if (explicit) return explicit;
  const sub =
    process.env.RENTVINE_SUBDOMAIN || process.env.RENTVINE_ACCOUNT || "pmilighthouse";
  return `https://${sub}.rentvine.com/api/manager`;
}

function str(v: unknown): string {
  return v == null ? "" : String(v);
}

// Rentvine wraps records in a singular key on read ({ workOrder: {...} }); pull
// the work order out of the create response whichever way it comes back.
function unwrapWorkOrder(json: unknown): Record<string, unknown> {
  if (json && typeof json === "object") {
    const obj = json as Record<string, unknown>;
    const inner = obj.workOrder;
    if (inner && typeof inner === "object") return inner as Record<string, unknown>;
    return obj;
  }
  return {};
}

export async function createRentvineWorkOrder(
  input: CreateWorkOrderInput
): Promise<CreateWorkOrderResult> {
  const apiKey = process.env.RENTVINE_API_KEY || "";
  const apiSecret = process.env.RENTVINE_API_SECRET || "";
  if (!apiKey || !apiSecret) {
    return {
      ok: false,
      status: 503,
      error: "Rentvine isn't configured — set RENTVINE_API_KEY / RENTVINE_API_SECRET.",
    };
  }
  if (!input.propertyId) {
    return { ok: false, status: 400, error: "No Rentvine property linked to this inspection." };
  }

  const auth = Buffer.from(`${apiKey}:${apiSecret}`).toString("base64");
  const payload: Record<string, unknown> = {
    propertyID: Number(input.propertyId),
    workOrderStatusID: input.workOrderStatusId ?? DEFAULT_STATUS,
    priorityID: input.priorityId ?? DEFAULT_PRIORITY,
    description: input.description,
  };
  if (input.unitId) payload.unitID = Number(input.unitId);

  try {
    const res = await fetch(`${baseUrl()}/maintenance/work-orders`, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        Authorization: `Basic ${auth}`,
      },
      body: JSON.stringify(payload),
    });
    const text = await res.text().catch(() => "");
    if (!res.ok) {
      return {
        ok: false,
        status: res.status,
        error: `Rentvine rejected the work order (HTTP ${res.status}). ${text.slice(0, 300)}`,
      };
    }
    let json: unknown = {};
    try {
      json = JSON.parse(text);
    } catch {
      /* non-JSON success body */
    }
    const wo = unwrapWorkOrder(json);
    const id = str(wo.workOrderID ?? wo.id);
    const ref = str(wo.workOrderNumber) || id;
    return { ok: true, ref: ref || "created", id };
  } catch (e) {
    return { ok: false, status: 502, error: e instanceof Error ? e.message : "Rentvine request failed." };
  }
}
