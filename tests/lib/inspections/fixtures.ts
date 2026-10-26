import type { ChecklistItem, InspectionRow, WorkItem } from "@/lib/inspections/types";

export function inspection(over: Partial<InspectionRow> = {}): InspectionRow {
  return {
    id: 1,
    property_id: 10,
    inspection_reason: "Routine",
    inspector_name: "Pat Inspector",
    inspection_date: "2026-10-20",
    inspection_time: "10:00",
    notes: null,
    overall_status: "Satisfactory",
    special_instructions: null,
    created_by_user_id: null,
    created_at: null,
    updated_at: null,
    deleted_at: null,
    summary_sent_at: null,
    ...over,
  };
}

let nextId = 1;
export function check(over: Partial<ChecklistItem> = {}): ChecklistItem {
  return {
    id: nextId++,
    inspection_id: 1,
    item_key: "water",
    item_label: "Water / Leaks",
    checked: true,
    status: "OK",
    issue_notes: null,
    ...over,
  };
}

export function workItem(over: Partial<WorkItem> = {}): WorkItem {
  return { id: nextId++, inspection_id: 1, service_name: "Lawn mowing", quantity: 1, notes: null, ...over };
}

export const property = { id: 10, name: "66 Francis Court", address: "66 Francis Court, Elmont, NY 11003" };
