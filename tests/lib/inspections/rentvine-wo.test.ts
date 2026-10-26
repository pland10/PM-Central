import { beforeEach, describe, expect, it, vi } from "vitest";
import { createRentvineWorkOrder } from "@/lib/inspections/rentvine-wo";
import { jsonResponse } from "../../helpers/fetch";

let rentvine: ReturnType<typeof vi.fn>;
const posted = () => JSON.parse(String(rentvine.mock.calls[0][1].body));

beforeEach(() => {
  vi.stubEnv("RENTVINE_API_KEY", "key");
  vi.stubEnv("RENTVINE_API_SECRET", "secret");
  vi.stubEnv("RENTVINE_BASE_URL", "https://acct.rentvine.com/api/manager");
  rentvine = vi.fn(async () => jsonResponse({ workOrder: { workOrderID: "812", workOrderNumber: "301" } }));
  vi.stubGlobal("fetch", rentvine);
});

describe("createRentvineWorkOrder", () => {
  it("creates a Requested, Medium-priority work order on the property by default", async () => {
    const result = await createRentvineWorkOrder({ propertyId: "12", description: "Fix the drip" });

    expect(result).toEqual({ ok: true, ref: "301", id: "812" });
    const [url, init] = rentvine.mock.calls[0];
    expect(url).toBe("https://acct.rentvine.com/api/manager/maintenance/work-orders");
    expect(init.method).toBe("POST");
    expect(posted()).toEqual({ propertyID: 12, workOrderStatusID: 4, priorityID: 2, description: "Fix the drip" });
  });

  it("sends priority, status and unit when given", async () => {
    await createRentvineWorkOrder({ propertyId: "12", description: "d", priorityId: 3, workOrderStatusId: 1, unitId: "7" });
    expect(posted()).toMatchObject({ priorityID: 3, workOrderStatusID: 1, unitID: 7 });
  });

  it("reads an unwrapped response and falls back to the id for the ref", async () => {
    rentvine.mockResolvedValue(jsonResponse({ workOrderID: "900" }));
    expect(await createRentvineWorkOrder({ propertyId: "12", description: "d" })).toEqual({ ok: true, ref: "900", id: "900" });
  });

  it("still reports success when Rentvine returns a non-JSON body", async () => {
    rentvine.mockResolvedValue(jsonResponse("Created"));
    expect(await createRentvineWorkOrder({ propertyId: "12", description: "d" })).toEqual({ ok: true, ref: "created", id: "" });
  });

  it("refuses without credentials or a linked property", async () => {
    expect(await createRentvineWorkOrder({ propertyId: "", description: "d" })).toMatchObject({ ok: false, status: 400 });
    vi.stubEnv("RENTVINE_API_SECRET", "");
    expect(await createRentvineWorkOrder({ propertyId: "12", description: "d" })).toMatchObject({ ok: false, status: 503 });
    expect(rentvine).not.toHaveBeenCalled();
  });

  it("returns Rentvine's rejection, or 502 on a network failure", async () => {
    rentvine.mockResolvedValueOnce(jsonResponse({ error: "bad property" }, { status: 422 }));
    expect(await createRentvineWorkOrder({ propertyId: "12", description: "d" })).toMatchObject({ ok: false, status: 422 });

    rentvine.mockRejectedValueOnce(new Error("timeout"));
    expect(await createRentvineWorkOrder({ propertyId: "12", description: "d" })).toEqual({ ok: false, status: 502, error: "timeout" });
  });
});
