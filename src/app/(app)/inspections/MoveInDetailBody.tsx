import type { ChecklistItem, InspectionPhoto, InspectionRow, MoveInMeta } from "@/lib/inspections/types";
import { formatInspectionDate } from "@/lib/inspections/types";
import { buildMoveInSections } from "@/lib/inspections/move-in-template";

// Read-only render of a move-in inspection: header details, the room-by-room
// survey grouped by the template's sections (so order/labels/kinds come from the
// template, values from the saved checklist), and the typed signatures.
export function MoveInDetailBody({
  inspection,
  checklist,
  photos = [],
}: {
  inspection: InspectionRow;
  checklist: ChecklistItem[];
  photos?: InspectionPhoto[];
}) {
  const m: MoveInMeta = inspection.meta ?? {};
  const sections = buildMoveInSections(m);
  const byKey = new Map(checklist.map((c) => [c.item_key ?? "", c]));
  // Per-item photos grouped by their label ("<section> — <item>").
  const photosByLabel = new Map<string, InspectionPhoto[]>();
  for (const p of photos) {
    if (!p.label) continue;
    const arr = photosByLabel.get(p.label) ?? [];
    arr.push(p);
    photosByLabel.set(p.label, arr);
  }

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

      {sections.map((section) => (
        <Card key={section.id} title={section.title}>
          <ul className="divide-y divide-slate-100">
            {section.items.map((item) => {
              const saved = byKey.get(item.key);
              const note = saved?.issue_notes || "";
              const working = item.kind === "working" ? saved?.status || "" : "";
              const itemPhotos = item.photo
                ? photosByLabel.get(`${section.title} — ${item.label}`) ?? []
                : [];
              const answered = Boolean(working || note || itemPhotos.length);
              return (
                <li key={item.key} className="py-2 text-sm">
                  <div className="flex items-start justify-between gap-3">
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
                  </div>
                  {itemPhotos.length > 0 && (
                    <div className="mt-1.5 flex flex-wrap gap-2">
                      {itemPhotos.map((p) =>
                        p.url ? (
                          <a
                            key={p.id}
                            href={p.url}
                            target="_blank"
                            rel="noreferrer"
                            className="block h-16 w-16 overflow-hidden rounded border border-slate-200 bg-slate-100"
                          >
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src={p.url} alt={item.label} className="h-full w-full object-cover" />
                          </a>
                        ) : null
                      )}
                    </div>
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
