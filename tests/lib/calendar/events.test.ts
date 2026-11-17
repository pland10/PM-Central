import { describe, expect, it } from "vitest";
import { STARTER_EVENTS, sanitizeEvent } from "@/lib/calendar/events";
import { parseRule } from "@/lib/calendar/rules";

const good = { title: "  Reconcile bank accounts ", description: "Trust + operating", rule: "me-5 bd", frequency: "monthly", month: null, adjust: "prior", ownerEmail: "" };

describe("sanitizeEvent", () => {
  it("trims, normalizes the rule, and clears month for monthly", () => {
    expect(sanitizeEvent({ ...good, month: 4 })).toEqual({
      ok: true,
      value: { title: "Reconcile bank accounts", description: "Trust + operating", rule: "ME-5BD", frequency: "monthly", month: null, adjust: "prior", ownerEmail: null },
    });
  });

  it("needs a title and a valid rule", () => {
    expect(sanitizeEvent({ ...good, title: " " })).toMatchObject({ ok: false, error: expect.stringMatching(/name/i) });
    expect(sanitizeEvent({ ...good, rule: "soon" })).toMatchObject({ ok: false, error: expect.stringMatching(/ME-5/) });
  });

  it("needs a month for quarterly (1–3) and yearly (1–12)", () => {
    expect(sanitizeEvent({ ...good, frequency: "quarterly", month: 3 })).toMatchObject({ ok: true, value: { month: 3 } });
    expect(sanitizeEvent({ ...good, frequency: "quarterly", month: 4 })).toMatchObject({ ok: false });
    expect(sanitizeEvent({ ...good, frequency: "yearly", month: 12 })).toMatchObject({ ok: true, value: { month: 12 } });
    expect(sanitizeEvent({ ...good, frequency: "yearly", month: null })).toMatchObject({ ok: false });
  });

  it("rejects unknown frequency / adjust, and over-long text", () => {
    expect(sanitizeEvent({ ...good, frequency: "weekly" })).toMatchObject({ ok: false });
    expect(sanitizeEvent({ ...good, adjust: "sideways" })).toMatchObject({ ok: false });
    expect(sanitizeEvent({ ...good, title: "x".repeat(121) })).toMatchObject({ ok: false });
    expect(sanitizeEvent({ ...good, description: "x".repeat(2001) })).toMatchObject({ ok: false });
  });

  it("keeps an owner email, lower-cased", () => {
    expect(sanitizeEvent({ ...good, ownerEmail: " Ari@PMI.com " })).toMatchObject({ ok: true, value: { ownerEmail: "ari@pmi.com" } });
  });
});

describe("STARTER_EVENTS", () => {
  it("are all valid, include ME-5, and cover monthly, quarterly and yearly", () => {
    for (const e of STARTER_EVENTS) expect(sanitizeEvent({ ...e, ownerEmail: null }).ok, e.title).toBe(true);
    for (const e of STARTER_EVENTS) expect(parseRule(e.rule).ok, e.rule).toBe(true);
    expect(STARTER_EVENTS.some((e) => e.rule === "ME-5")).toBe(true);
    expect(new Set(STARTER_EVENTS.map((e) => e.frequency))).toEqual(new Set(["monthly", "quarterly", "yearly"]));
  });
});
