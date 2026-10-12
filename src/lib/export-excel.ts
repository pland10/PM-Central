// Client-side Excel (.xlsx) export. Uses write-excel-file (zero-dependency,
// write-only) loaded on demand so it stays out of the main bundle — it only
// downloads when someone actually clicks Export.

export type ExportCell = string | number | null;
export type ExportSheet = { name: string; headers: string[]; rows: ExportCell[][] };

type XlsxCell = { value: string | number | null; type?: unknown; fontWeight?: "bold" };

function toSheetRows(s: ExportSheet): XlsxCell[][] {
  const header: XlsxCell[] = s.headers.map((h) => ({ value: h, fontWeight: "bold" }));
  const body: XlsxCell[][] = s.rows.map((r) =>
    r.map((v): XlsxCell => {
      if (v === null || v === "") return { value: null };
      if (typeof v === "number") return { value: v, type: Number };
      return { value: String(v), type: String };
    })
  );
  return [header, ...body];
}

// A short, filesystem-safe date suffix for the filename, e.g. 2026-10-12.
export function todayStamp(): string {
  return new Date().toISOString().slice(0, 10);
}

export async function downloadXlsx(fileName: string, sheets: ExportSheet[]): Promise<void> {
  if (sheets.length === 0) return;
  const writeXlsxFile = (await import("write-excel-file")).default;
  const name = fileName.endsWith(".xlsx") ? fileName : `${fileName}.xlsx`;
  // Excel sheet names max 31 chars and can't contain : \ / ? * [ ]
  const safeName = (n: string) => n.replace(/[:\\/?*[\]]/g, " ").slice(0, 31) || "Sheet1";

  if (sheets.length === 1) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await writeXlsxFile(toSheetRows(sheets[0]) as any, { fileName: name });
  } else {
    await writeXlsxFile(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      sheets.map(toSheetRows) as any,
      { sheets: sheets.map((s) => safeName(s.name)), fileName: name }
    );
  }
}
