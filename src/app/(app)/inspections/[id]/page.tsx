import Link from "next/link";
import { notFound } from "next/navigation";
import { requireFeature } from "@/config/features";
import { getInspectionDetail } from "@/lib/inspections/db";
import {
  statusTone,
  formatInspectionDate,
  parseSpecialInstructions,
} from "@/lib/inspections/types";
import { InspectionActions } from "../InspectionActions";
import { CompleteAndSend } from "../CompleteAndSend";
import { PhotoUploader } from "../PhotoUploader";

export const dynamic = "force-dynamic";

const TONE_STYLES: Record<string, string> = {
  good: "bg-emerald-100 text-emerald-700",
  warn: "bg-amber-100 text-amber-700",
  bad: "bg-red-100 text-red-700",
  neutral: "bg-slate-100 text-slate-600",
};

export default async function InspectionDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  requireFeature("inspections");
  const { id } = await params;
  const inspectionId = Number(id);
  if (!Number.isFinite(inspectionId)) notFound();

  const detail = await getInspectionDetail(inspectionId);
  if (!detail) notFound();
  const { inspection: insp, property, checklist, photos, workItems } = detail;

  return (
    <div className="mx-auto max-w-3xl">
      <Link href="/inspections" className="text-sm text-slate-500 hover:text-brand-600">
        ← All inspections
      </Link>

      <div className="mt-2 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-lg font-semibold text-ink">
            {property?.name || "Inspection"}
          </h1>
          {property?.address && <p className="text-sm text-slate-500">{property.address}</p>}
        </div>
        <div className="flex flex-col items-end gap-2">
          {insp.overall_status && (
            <span
              className={`inline-flex rounded px-2 py-0.5 text-xs font-medium capitalize ${
                TONE_STYLES[statusTone(insp.overall_status)]
              }`}
            >
              {insp.overall_status}
            </span>
          )}
          <InspectionActions id={insp.id} />
          <CompleteAndSend
            id={insp.id}
            photos={photos.map((p) => ({ id: p.id, url: p.url, original_name: p.original_name }))}
            sentAt={insp.summary_sent_at}
          />
        </div>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-4 rounded-lg border border-slate-200 bg-white p-4 text-sm sm:grid-cols-4">
        <Field label="Date" value={formatInspectionDate(insp.inspection_date)} />
        <Field label="Time" value={insp.inspection_time || "—"} />
        <Field label="Inspector" value={insp.inspector_name || "—"} />
        <Field label="Reason" value={insp.inspection_reason || "—"} />
      </div>

      {(() => {
        const si = parseSpecialInstructions(insp.special_instructions);
        if (si.states.length) {
          return (
            <Section title="Special instructions">
              <ul className="space-y-1.5">
                {si.states.map((st) => (
                  <li key={st.id} className="flex items-center gap-2 text-sm">
                    <span className={st.checked ? "text-emerald-600" : "text-slate-300"}>
                      {st.checked ? "✓" : "○"}
                    </span>
                    <span className="text-slate-700">{st.name}</span>
                  </li>
                ))}
              </ul>
            </Section>
          );
        }
        if (si.text) {
          return (
            <Section title="Special instructions">
              <p className="whitespace-pre-line text-sm text-slate-700">{si.text}</p>
            </Section>
          );
        }
        return null;
      })()}

      {insp.notes && (
        <Section title="Notes">
          <p className="whitespace-pre-line text-sm text-slate-700">{insp.notes}</p>
        </Section>
      )}

      {checklist.length > 0 && (
        <Section title="Checklist">
          <ul className="divide-y divide-slate-100">
            {checklist.map((c) => (
              <li key={c.id} className="flex items-start gap-3 py-2 text-sm">
                <span className={c.checked ? "text-emerald-600" : "text-slate-300"}>
                  {c.checked ? "✓" : "○"}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="text-slate-800">{c.item_label || c.item_key}</div>
                  {c.issue_notes && <div className="text-xs text-slate-500">{c.issue_notes}</div>}
                </div>
                {c.status && (
                  <span
                    className={`shrink-0 rounded px-1.5 py-0.5 text-[11px] font-medium capitalize ${
                      TONE_STYLES[statusTone(c.status)]
                    }`}
                  >
                    {c.status}
                  </span>
                )}
              </li>
            ))}
          </ul>
        </Section>
      )}

      {workItems.length > 0 && (
        <Section title="Work items">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500">
                <th className="pb-2 font-medium">Service</th>
                <th className="pb-2 text-right font-medium">Qty</th>
                <th className="pb-2 font-medium">Notes</th>
              </tr>
            </thead>
            <tbody>
              {workItems.map((w) => (
                <tr key={w.id} className="border-b border-slate-100 last:border-0">
                  <td className="py-2 text-slate-800">{w.service_name || "—"}</td>
                  <td className="py-2 text-right text-slate-600">{w.quantity ?? 1}</td>
                  <td className="py-2 text-slate-600">{w.notes || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Section>
      )}

      <Section title={`Photos${photos.length ? ` (${photos.length})` : ""}`}>
        <div className="mb-3">
          <PhotoUploader inspectionId={insp.id} />
        </div>
        {photos.length === 0 ? (
          <p className="text-sm text-slate-400">No photos.</p>
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {photos.map((ph) =>
              ph.url ? (
                <a
                  key={ph.id}
                  href={ph.url}
                  target="_blank"
                  rel="noreferrer"
                  className="group block overflow-hidden rounded-lg border border-slate-200"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={ph.url}
                    alt={ph.original_name || "Inspection photo"}
                    className="h-32 w-full object-cover transition-transform group-hover:scale-105"
                  />
                </a>
              ) : null
            )}
          </div>
        )}
      </Section>
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

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mt-4 rounded-lg border border-slate-200 bg-white p-4">
      <h2 className="mb-2 text-sm font-semibold text-ink">{title}</h2>
      {children}
    </div>
  );
}
