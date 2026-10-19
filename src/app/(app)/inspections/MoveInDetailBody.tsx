import type { ChecklistItem, InspectionRow, MoveInMeta } from "@/lib/inspections/types";
import { formatInspectionDate } from "@/lib/inspections/types";
import { MOVE_IN_TEMPLATE } from "@/lib/inspections/move-in-template";

// Read-only render of a move-in inspection: header details, the room-by-room
// survey grouped by the template's sections (so order/labels/kinds come from the
// template, values from the saved checklist), and the typed signatures.
export function MoveInDetailBody({
  inspection,
  checklist,
}: {
  inspection: InspectionRow;
  checklist: ChecklistItem[];
}) {
  const m: MoveInMeta = inspection.meta ?? {};
  const byKey = new Map(checklist.map((c) => [c.item_key ?? "", c]));

  return (
    <>
      <Card title="Move-in details">
        <div className="grid grid-cols-2 gap-4 text-sm sm:grid-cols-4">
          <Field label="Tenant(s)" value={m.tenantNames || "—"} />
          <Field label="Move-in date" value={m.moveInDate ? formatInspectionDate(m.moveInDate) : "—"} />
          <Field label="Inspected" value={formatInspectionDate(inspection.inspection_date)} />
          <Field label="Inspector" value={inspection.inspector_name || "—"} />
        </div>
      </Card>

      {MOVE_IN_TEMPLATE.map((section) => (
        <Card key={section.id} title={section.title}>
          <ul className="divide-y divide-slate-100">
            {section.items.map((item) => {
              const saved = byKey.get(item.key);
              const note = saved?.issue_notes || "";
              const working = item.kind === "working" ? saved?.status || "" : "";
              const answered = Boolean(working || note);
              return (
                <li key={item.key} className="flex items-start justify-between gap-3 py-2 text-sm">
                  <div className="min-w-0">
                    <div className="text-slate-800">{item.label}</div>
                    {note && (
                      <div className="text-xs text-slate-500">
                        {item.kind === "value" ? note : <>Condition: {note}</>}
                      </div>
                    )}
                    {!answered && <div className="text-xs text-slate-300">Not recorded</div>}
                  </div>
                  {item.kind === "working" && working && (
                    <span
                      className={`shrink-0 rounded px-1.5 py-0.5 text-[11px] font-medium ${
                        working === "Yes"
                          ? "bg-emerald-100 text-emerald-700"
                          : "bg-red-100 text-red-700"
                      }`}
                    >
                      {working}
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
        </Card>
      ))}

      {(m.tenantSigName || m.pmSigName) && (
        <Card title="Signatures">
          <div className="grid grid-cols-1 gap-4 text-sm sm:grid-cols-2">
            <Sig role="Tenant" name={m.tenantSigName} date={m.tenantSigDate} />
            <Sig role="Property manager" name={m.pmSigName} date={m.pmSigDate} />
          </div>
        </Card>
      )}
    </>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mt-4 rounded-lg border border-slate-200 bg-white p-4">
      <h2 className="mb-2 text-sm font-semibold text-ink">{title}</h2>
      {children}
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-xs uppercase tracking-wide text-slate-500">{label}</div>
      <div className="text-slate-800">{value}</div>
    </div>
  );
}

function Sig({ role, name, date }: { role: string; name?: string; date?: string }) {
  return (
    <div className="rounded-md border border-slate-200 p-3">
      <div className="text-xs uppercase tracking-wide text-slate-500">{role}</div>
      <div className="mt-1 text-slate-800">{name || "—"}</div>
      <div className="text-xs text-slate-400">{date ? formatInspectionDate(date) : ""}</div>
    </div>
  );
}
